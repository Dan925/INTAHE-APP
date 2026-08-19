import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { ApiError, useAuth } from '@/lib/auth-context';
import { checkInTicket, type GuestListEntry } from '@/lib/checkin';

const ERROR_MESSAGES: Record<string, string> = {
  ticket_not_found: "Aucun billet ne correspond à ce code pour cet événement.",
  ticket_already_checked_in: 'Ce billet a déjà été scanné.',
};

export default function CheckInScreen() {
  const { orgId, eventId } = useLocalSearchParams<{ orgId: string; eventId: string }>();
  const { session } = useAuth();

  const [qrCode, setQrCode] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastTicket, setLastTicket] = useState<GuestListEntry | null>(null);

  async function onCheckIn() {
    if (!session || !qrCode.trim()) return;
    setIsChecking(true);
    setError(null);
    setLastTicket(null);
    try {
      const result = await checkInTicket(session.token, orgId, eventId, qrCode.trim());
      setLastTicket(result.ticket);
      setQrCode('');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(ERROR_MESSAGES[err.code] ?? err.message);
      } else {
        setError('Impossible de valider ce billet.');
      }
    } finally {
      setIsChecking(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
          Saisis le code du billet (habituellement scanné via QR code) pour l&apos;enregistrer à l&apos;entrée.
        </ThemedText>

        <TextField
          label="Code du billet"
          value={qrCode}
          onChangeText={setQrCode}
          autoCapitalize="none"
          autoCorrect={false}
        />

        {error ? (
          <ThemedText type="small" themeColor="destructive" style={styles.message}>
            {error}
          </ThemedText>
        ) : null}

        <Button title="Enregistrer l'entrée" onPress={onCheckIn} loading={isChecking} disabled={!qrCode.trim()} />

        {lastTicket ? (
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold" themeColor="success">
              Billet validé
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {lastTicket.ticket_type_name} — {lastTicket.attendee_name ?? lastTicket.buyer_email}
            </ThemedText>
          </ThemedView>
        ) : null}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.four,
  },
  hint: {
    marginBottom: Spacing.four,
  },
  message: {
    marginBottom: Spacing.three,
  },
  card: {
    borderRadius: Radius.medium,
    padding: Spacing.three,
    marginTop: Spacing.four,
    gap: 4,
  },
});
