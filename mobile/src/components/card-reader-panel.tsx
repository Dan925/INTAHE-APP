import { useStripeTerminal, type Reader } from '@stripe/stripe-terminal-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ListItem } from '@/components/list-item';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTranslation } from '@/lib/i18n/context';
import { getReaderLocationId, setUpReaderLocation } from '@/lib/quickSales';
import { setTerminalSession } from '@/lib/terminalSession';

/**
 * Shared by the Quick Sale screen and the door-sale (in-person ticket)
 * screen — both need the exact same reader-location setup + discover/
 * connect flow before they can take an in_person sale. Owns its own reader
 * lifecycle (initialize, terminalSession wiring, discovery, connect/
 * disconnect); a parent screen that also calls useStripeTerminal() sees the
 * same connectedReader/payment functions automatically, since they share
 * one underlying StripeTerminalProvider context.
 */
export function CardReaderPanel({ orgId, token }: { orgId: string; token: string }) {
  const { t } = useTranslation();

  const [locationId, setLocationId] = useState<string | null>(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState(true);

  const [showSetup, setShowSetup] = useState(false);
  const [setupName, setSetupName] = useState('');
  const [setupLine1, setSetupLine1] = useState('');
  const [setupCity, setSetupCity] = useState('');
  const [setupState, setSetupState] = useState('');
  const [setupPostalCode, setSetupPostalCode] = useState('');
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [readerError, setReaderError] = useState<string | null>(null);

  const { initialize, discoverReaders, connectReader, disconnectReader, connectedReader, discoveredReaders, isInitialized } =
    useStripeTerminal();

  useEffect(() => {
    setTerminalSession(token, orgId);
    return () => setTerminalSession(null, null);
  }, [token, orgId]);

  const didInitRef = useRef(false);
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    initialize().then((result) => {
      if (result.error) setReaderError(result.error.message);
    });
  }, [initialize]);

  useEffect(() => {
    return () => {
      if (connectedReader) disconnectReader();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadLocation = useCallback(async () => {
    setIsLoadingLocation(true);
    try {
      const result = await getReaderLocationId(token, orgId);
      setLocationId(result.location_id);
    } finally {
      setIsLoadingLocation(false);
    }
  }, [token, orgId]);

  useEffect(() => {
    loadLocation();
  }, [loadLocation]);

  async function onSetUpReader() {
    if (!setupName.trim() || !setupLine1.trim() || !setupCity.trim() || !setupPostalCode.trim()) return;
    setIsSettingUp(true);
    setSetupError(null);
    try {
      await setUpReaderLocation(token, orgId, {
        display_name: setupName.trim(),
        address: {
          line1: setupLine1.trim(),
          city: setupCity.trim(),
          ...(setupState.trim() ? { state: setupState.trim() } : {}),
          postal_code: setupPostalCode.trim(),
          country: 'CA',
        },
      });
      setShowSetup(false);
      await loadLocation();
    } catch (err) {
      setSetupError(err instanceof Error ? err.message : t('card_reader.setup_error'));
    } finally {
      setIsSettingUp(false);
    }
  }

  async function onDiscoverAndConnect() {
    if (!locationId) return;
    setReaderError(null);
    setIsDiscovering(true);
    try {
      const discovery = await discoverReaders({ discoveryMethod: 'internet', locationId, timeout: 0 });
      if (discovery.error) {
        setReaderError(discovery.error.message);
        setIsDiscovering(false);
      }
    } catch (err) {
      setReaderError(err instanceof Error ? err.message : t('card_reader.connect_error'));
      setIsDiscovering(false);
    }
  }

  // discoverReaders streams results into discoveredReaders rather than
  // resolving with them — stop showing the "discovering" state once at
  // least one reader has shown up, or leave it running so the merchant can
  // still retry if none appear yet.
  useEffect(() => {
    if (discoveredReaders.length > 0) setIsDiscovering(false);
  }, [discoveredReaders]);

  async function onConnect(reader: Reader.Type) {
    setIsConnecting(true);
    setReaderError(null);
    try {
      const result = await connectReader({ discoveryMethod: 'internet', reader, failIfInUse: false });
      if (result.error) setReaderError(result.error.message);
    } catch (err) {
      setReaderError(err instanceof Error ? err.message : t('card_reader.connect_error'));
    } finally {
      setIsConnecting(false);
      setIsDiscovering(false);
    }
  }

  if (isLoadingLocation) {
    return (
      <ThemedView type="backgroundElement" style={styles.card}>
        <ActivityIndicator size="small" />
      </ThemedView>
    );
  }

  if (!locationId) {
    return showSetup ? (
      <ThemedView type="backgroundElement" style={styles.card}>
        <TextField label={t('card_reader.display_name_label')} value={setupName} onChangeText={setSetupName} />
        <TextField label={t('card_reader.address_line1_label')} value={setupLine1} onChangeText={setSetupLine1} />
        <TextField label={t('card_reader.address_city_label')} value={setupCity} onChangeText={setSetupCity} />
        <TextField label={t('card_reader.address_state_label')} value={setupState} onChangeText={setSetupState} />
        <TextField
          label={t('card_reader.address_postal_code_label')}
          value={setupPostalCode}
          onChangeText={setSetupPostalCode}
        />
        {setupError ? (
          <ThemedText type="small" themeColor="destructive" style={styles.error}>
            {setupError}
          </ThemedText>
        ) : null}
        <Button
          title={t('card_reader.setup_submit')}
          onPress={onSetUpReader}
          loading={isSettingUp}
          disabled={!setupName.trim() || !setupLine1.trim() || !setupCity.trim() || !setupPostalCode.trim()}
        />
      </ThemedView>
    ) : (
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.cardText}>
          {t('card_reader.not_set_up')}
        </ThemedText>
        <Button title={t('card_reader.setup_button')} variant="ghost" onPress={() => setShowSetup(true)} />
      </ThemedView>
    );
  }

  if (connectedReader) {
    return (
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="small">
          {t('card_reader.connected_prefix', { label: connectedReader.label ?? connectedReader.serialNumber })}
        </ThemedText>
        <Button title={t('card_reader.disconnect_button')} variant="ghost" onPress={() => disconnectReader()} />
      </ThemedView>
    );
  }

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      {readerError ? (
        <ThemedText type="small" themeColor="destructive" style={styles.error}>
          {readerError}
        </ThemedText>
      ) : null}
      {discoveredReaders.length > 0 ? (
        discoveredReaders.map((reader) => (
          <ListItem
            key={reader.id}
            title={reader.label ?? reader.serialNumber}
            onPress={() => onConnect(reader)}
            right={isConnecting ? <ActivityIndicator size="small" /> : undefined}
          />
        ))
      ) : isDiscovering ? (
        <View style={styles.discoveringRow}>
          <ActivityIndicator size="small" />
          <ThemedText type="small" themeColor="textSecondary">
            {t('card_reader.discovering')}
          </ThemedText>
        </View>
      ) : (
        <Button
          title={t('card_reader.connect_button')}
          variant="ghost"
          onPress={onDiscoverAndConnect}
          disabled={!isInitialized}
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.medium,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  cardText: {
    marginBottom: Spacing.two,
  },
  error: {
    marginBottom: Spacing.two,
  },
  discoveringRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
