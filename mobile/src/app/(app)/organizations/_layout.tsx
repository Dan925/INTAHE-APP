import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';

export default function OrganizationsLayout() {
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.text,
        headerShadowVisible: false,
      }}>
      <Stack.Screen name="index" options={{ title: 'Organisations' }} />
      <Stack.Screen name="[orgId]/index" options={{ title: '' }} />
      <Stack.Screen name="[orgId]/events/[eventId]" options={{ title: 'Événement' }} />
      <Stack.Screen name="[orgId]/events/[eventId]/tickets/[orderId]" options={{ title: 'Mes billets' }} />
    </Stack>
  );
}
