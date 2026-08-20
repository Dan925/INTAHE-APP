import { Stack } from 'expo-router';

import { useTranslation } from '@/lib/i18n/context';
import { useTheme } from '@/hooks/use-theme';

export default function ProfileLayout() {
  const theme = useTheme();
  const { t } = useTranslation();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.text,
        headerShadowVisible: false,
      }}>
      <Stack.Screen name="index" options={{ title: t('profile.title') }} />
      <Stack.Screen name="delete-account" options={{ title: t('delete_account.title') }} />
    </Stack>
  );
}
