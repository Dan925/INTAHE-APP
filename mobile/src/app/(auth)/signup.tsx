import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { ApiError, useAuth } from '@/lib/auth-context';

export default function SignupScreen() {
  const { signup } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit() {
    setEmailError(null);
    setFormError(null);
    setIsSubmitting(true);
    try {
      await signup({ email: email.trim().toLowerCase(), password, full_name: fullName.trim() });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'email_already_registered') {
        setEmailError('Un compte existe déjà avec cet email.');
      } else if (err instanceof ApiError && err.code === 'validation_error') {
        setFormError(err.message);
      } else {
        setFormError('Une erreur est survenue. Réessaie.');
      }
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
          <ThemedText type="title">Créer un compte</ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
            Un seul compte pour acheter des billets et organiser des événements.
          </ThemedText>

          <TextField label="Nom complet" value={fullName} onChangeText={setFullName} />
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            error={emailError}
          />
          <TextField
            label="Mot de passe"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="newPassword"
          />

          {formError ? (
            <ThemedText type="small" themeColor="destructive" style={styles.error}>
              {formError}
            </ThemedText>
          ) : null}

          <Button title="Créer le compte" onPress={onSubmit} loading={isSubmitting} />

          <Link href="/(auth)/login" style={styles.link}>
            <ThemedText type="linkPrimary" themeColor="primary">
              Déjà un compte ? Connecte-toi
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
