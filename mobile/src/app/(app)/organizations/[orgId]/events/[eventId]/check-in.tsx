import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { ApiError, useAuth } from '@/lib/auth-context';
import { checkInTicket, type CheckInResult } from '@/lib/checkin';
import { useTranslation } from '@/lib/i18n/context';

export default function CheckInScreen() {
  const { orgId, eventId } = useLocalSearchParams<{ orgId: string; eventId: string }>();
  const { session } = useAuth();
  const { t } = useTranslation();

  const ERROR_MESSAGES: Record<string, string> = {
    ticket_not_found: t('check_in.error_not_found'),
    ticket_already_checked_in: t('check_in.error_already'),
  };

  const [qrCode, setQrCode] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastTicket, setLastTicket] = useState<CheckInResult | null>(null);

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
        setError(t('check_in.error_generic'));
      }
    } finally {
      setIsChecking(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.content}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
          {t('check_in.hint')}
        </ThemedText>

        <TextField
          label={t('check_in.code_label')}
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

        <Button
          title={t('check_in.submit_button')}
          onPress={onCheckIn}
          loading={isChecking}
          disabled={!qrCode.trim()}
        />

        {lastTicket ? (
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold" themeColor="success">
              {t('check_in.success_title')}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {lastTicket.ticket_type_name} — {lastTicket.attendee_name ?? lastTicket.buyer_email}
            </ThemedText>
            {lastTicket.ticket_type_capacity_exceeded ? (
              <ThemedText type="smallBold" themeColor="destructive">
                {t('check_in.capacity_warning', { n: lastTicket.ticket_type_overshoot_quantity })}
              </ThemedText>
            ) : null}
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
