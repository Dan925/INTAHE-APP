import { Redirect } from 'expo-router';

import { useAuth } from '@/lib/auth-context';

export default function Index() {
  const { session } = useAuth();
  return <Redirect href={session ? '/organizations' : '/login'} />;
}
