import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTranslation } from '@/lib/i18n/context';
import { ApiError, useAuth } from '@/lib/auth-context';

export default function LoginScreen() {
  const { login } = useAuth();
  const { t, locale, setLocale } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit() {
    setError(null);
    setIsSubmitting(true);
    try {
      await login({ email: email.trim().toLowerCase(), password });
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'invalid_credentials'
          ? t('login.invalid_credentials')
          : t('common.error_generic'),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.select({ ios: 'padding', default: undefined })}>
      <ThemedView style={styles.container}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Pressable
            accessibilityRole="button"
            onPress={() => setLocale(locale === 'fr' ? 'en' : 'fr')}
            style={styles.langToggle}>
            <ThemedText type="small" themeColor="primary">
              {locale === 'fr' ? 'English' : 'Français'}
            </ThemedText>
          </Pressable>

          <ThemedText type="title">{t('login.brand')}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
            {t('login.subtitle')}
          </ThemedText>

          <TextField
            label={t('login.email')}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
          />
          <TextField
            label={t('login.password')}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="password"
          />

          {error ? (
            <ThemedText type="small" themeColor="destructive" style={styles.error}>
              {error}
            </ThemedText>
          ) : null}

          <Button title={t('login.submit')} onPress={onSubmit} loading={isSubmitting} />

          <Link href="/(auth)/signup" style={styles.link}>
            <ThemedText type="linkPrimary" themeColor="primary">
              {t('login.no_account')}
            </ThemedText>
          </Link>

          <Link href="/discover" style={styles.link}>
            <ThemedText type="link" themeColor="textSecondary">
              {t('login.discover_link')}
            </ThemedText>
          </Link>
        </ScrollView>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.four,
    paddingTop: Spacing.six,
  },
  langToggle: {
    alignSelf: 'flex-end',
    marginBottom: Spacing.three,
  },
  subtitle: {
    marginTop: Spacing.one,
    marginBottom: Spacing.five,
  },
  error: {
    marginBottom: Spacing.three,
  },
  link: {
    marginTop: Spacing.four,
    alignSelf: 'center',
  },
});
