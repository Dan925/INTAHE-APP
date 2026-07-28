import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { ApiError, useAuth } from '@/lib/auth-context';

export default function LoginScreen() {
  const { login } = useAuth();
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
          ? 'Email ou mot de passe incorrect.'
          : "Une erreur est survenue. Réessaie.",
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
          <ThemedText type="title">Intahe</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
            Connecte-toi pour gérer tes événements ou tes billets.
          </ThemedText>

          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
          />
          <TextField
            label="Mot de passe"
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

          <Button title="Se connecter" onPress={onSubmit} loading={isSubmitting} />

          <Link href="/(auth)/signup" style={styles.link}>
            <ThemedText type="linkPrimary" themeColor="primary">
              Pas encore de compte ? Inscris-toi
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
