import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';
import { useTranslation } from '@/lib/i18n/context';

export default function OrganizationsLayout() {
  const theme = useTheme();
  const { t } = useTranslation();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.text,
        headerShadowVisible: false,
      }}>
      <Stack.Screen name="index" options={{ title: t('nav.organizations') }} />
      <Stack.Screen name="[orgId]/index" options={{ title: '' }} />
      <Stack.Screen name="[orgId]/members" options={{ title: t('nav.members') }} />
      <Stack.Screen name="[orgId]/dashboard" options={{ title: t('nav.dashboard') }} />
      <Stack.Screen name="[orgId]/events/[eventId]" options={{ title: '' }} />
      <Stack.Screen name="[orgId]/events/[eventId]/tickets/[orderId]" options={{ title: t('tickets.header_title') }} />
      <Stack.Screen name="[orgId]/events/[eventId]/orders/index" options={{ title: t('nav.orders') }} />
      <Stack.Screen name="[orgId]/events/[eventId]/guest-list" options={{ title: t('nav.guest_list') }} />
      <Stack.Screen name="[orgId]/events/[eventId]/check-in" options={{ title: t('nav.check_in') }} />
    </Stack>
  );
}
