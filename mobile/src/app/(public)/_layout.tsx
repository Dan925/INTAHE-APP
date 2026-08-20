import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';
import { useTranslation } from '@/lib/i18n/context';

export default function PublicLayout() {
  const theme = useTheme();
  const { t } = useTranslation();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.text,
        headerShadowVisible: false,
      }}>
      <Stack.Screen name="discover" options={{ title: t('discover.header_title') }} />
      <Stack.Screen name="events/[eventId]" options={{ title: t('event_detail.header_title') }} />
      <Stack.Screen
        name="events/[eventId]/tickets/[orderId]"
        options={{ title: t('tickets.header_title') }}
      />
    </Stack>
  );
}
