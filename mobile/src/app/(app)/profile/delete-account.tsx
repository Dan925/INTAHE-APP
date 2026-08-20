import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTranslation } from '@/lib/i18n/context';
import { ApiError, useAuth } from '@/lib/auth-context';

export default function DeleteAccountScreen() {
  const { session, deleteAccount } = useAuth();
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const needsPassword = session?.user.has_password ?? false;

  async function performDeletion() {
    setError(null);
    setIsSubmitting(true);
    try {
      await deleteAccount(needsPassword ? password : undefined);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'invalid_password') {
        setError(t('delete_account.invalid_password'));
      } else if (err instanceof ApiError && err.code === 'owns_organizations') {
        setError(t('delete_account.owns_organizations'));
      } else {
        setError(t('delete_account.error_generic'));
      }
      setIsSubmitting(false);
    }
  }

  function onConfirmPress() {
    if (needsPassword && !password) {
      setError(t('delete_account.password_required'));
      return;
    }
    Alert.alert(
      t('delete_account.confirm_dialog_title'),
      t('delete_account.confirm_dialog_message'),
      [
        { text: t('delete_account.confirm_dialog_cancel'), style: 'cancel' },
        { text: t('delete_account.confirm_dialog_confirm'), style: 'destructive', onPress: performDeletion },
      ],
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.select({ ios: 'padding', default: undefined })}>
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.content}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <ThemedText type="title">{t('delete_account.title')}</ThemedText>

            <ThemedText type="small" themeColor="textSecondary" style={styles.warning}>
              {t('delete_account.warning')}
            </ThemedText>

            {needsPassword ? (
              <TextField
                label={t('delete_account.password_label')}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                textContentType="password"
              />
            ) : null}

            {error ? (
              <ThemedText type="small" themeColor="destructive" style={styles.error}>
                {error}
              </ThemedText>
            ) : null}

            <Button
              title={t('delete_account.confirm_button')}
              variant="destructive"
              onPress={onConfirmPress}
              loading={isSubmitting}
              style={styles.confirmButton}
            />
          </ScrollView>
        </SafeAreaView>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: Spacing.four,
  },
  warning: {
    marginTop: Spacing.two,
    marginBottom: Spacing.five,
  },
  error: {
    marginBottom: Spacing.three,
  },
  confirmButton: {
    marginTop: Spacing.three,
  },
});
