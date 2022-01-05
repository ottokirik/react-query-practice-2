/* eslint-disable import/no-unresolved */
import { useCustomToast } from 'components/app/hooks/useCustomToast';
import jsonpatch from 'fast-json-patch';
import {
  UseMutateAsyncFunction,
  useMutation,
  useQueryClient,
} from 'react-query';
import { queryKeys } from 'react-query/constants';

import type { User } from '../../../../../shared/types';
import { axiosInstance } from '../../../axiosInstance';
import { useUser } from './useUser';

async function patchUserOnServer(
  newData: User | null,
  originalData: User | null,
): Promise<User | null> {
  if (!newData || !originalData) return null;
  // create a patch for the difference between newData and originalData
  const patch = jsonpatch.compare(originalData, newData);

  // send patched data to the server
  const { data } = await axiosInstance.patch(
    `/user/${originalData.id}`,
    { patch },
    {
      headers: { Authorization: `Bearer ${originalData.token}` },
    },
  );
  return data.user;
}

export function usePatchUser(): UseMutateAsyncFunction<
  User,
  unknown,
  User,
  unknown
> {
  const { user, updateUser } = useUser();
  const toast = useCustomToast();
  const queryClient = useQueryClient();

  const { mutateAsync: patchUser } = useMutation(
    (newUserData: User) => patchUserOnServer(newUserData, user),
    {
      // onMutate returns context that is passed to onError
      onMutate: async (newUserData: User | null) => {
        // cancel any outgoing queries for user data, so old server data
        // doesn't overwrite our optimistic update
        queryClient.cancelQueries(queryKeys.user);
        // snapshot of previous user value
        const previousUserData: User = queryClient.getQueryData(queryKeys.user);
        // optimistically update the cache with new user value
        updateUser(newUserData);
        // return context object with snapshotted value
        return { previousUserData };
      },
      onError: (error, newUserData, context) => {
        // roll back cache to saved value
        if (!context.previousUserData) return;

        updateUser(context.previousUserData);

        toast({
          title: 'Update failed; restoring previous values',
          status: 'warning',
        });
      },
      onSuccess: (userData: User | null) => {
        if (!user) return;
        toast({ title: 'User updated', status: 'success' });
      },
      onSettled: () => {
        // invalidate user query to make sure we're in sync with server data
        queryClient.invalidateQueries(queryKeys.user);
      },
    },
  );

  return patchUser;
}
