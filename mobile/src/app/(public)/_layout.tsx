import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';

export default function PublicLayout() {
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.text,
        headerShadowVisible: false,
      }}>
      <Stack.Screen name="discover" options={{ title: 'Découvrir' }} />
      <Stack.Screen name="events/[eventId]" options={{ title: 'Événement' }} />
      <Stack.Screen name="events/[eventId]/tickets/[orderId]" options={{ title: 'Mes billets' }} />
    </Stack>
  );
}
