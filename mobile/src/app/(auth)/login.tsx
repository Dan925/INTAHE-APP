import * as AppleAuthentication from 'expo-apple-authentication';
import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTranslation } from '@/lib/i18n/context';
import { ApiError, useAuth } from '@/lib/auth-context';

export default function LoginScreen() {
  const { login, loginWithApple } = useAuth();
  const { t, locale, setLocale } = useTranslation();
  const colorScheme = useColorScheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAppleSignInAvailable, setIsAppleSignInAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync().then(setIsAppleSignInAvailable);
  }, []);

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

  async function onApplePress() {
    setError(null);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) {
        throw new Error('Apple sign-in did not return an identity token.');
      }
      const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
        .filter(Boolean)
        .join(' ')
        .trim();
      await loginWithApple({ identityToken: credential.identityToken, fullName: fullName || undefined });
    } catch (err) {
      // The user cancelling the Apple sheet isn't an error worth surfacing.
      if (err instanceof Error && err.message.includes('ERR_REQUEST_CANCELED')) return;
      setError(t('login.apple_error'));
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

          {isAppleSignInAvailable ? (
            <>
              <ThemedText type="small" themeColor="textSecondary" style={styles.orDivider}>
                {t('login.or_divider')}
              </ThemedText>
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={
                  colorScheme === 'dark'
                    ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                    : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                }
                cornerRadius={8}
                style={styles.appleButton}
                onPress={onApplePress}
              />
            </>
          ) : null}

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
  orDivider: {
    textAlign: 'center',
    marginTop: Spacing.four,
    marginBottom: Spacing.three,
  },
  appleButton: {
    height: 48,
  },
});
