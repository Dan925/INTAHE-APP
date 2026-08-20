import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';

export default function ProfileScreen() {
  const { session, logout } = useAuth();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.content}>
        <ThemedText type="title">Profil</ThemedText>

        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold">{session?.user.full_name}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {session?.user.email}
          </ThemedText>
        </ThemedView>

        <Button title="Se déconnecter" variant="destructive" onPress={logout} style={styles.logout} />
      </SafeAreaView>
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
  card: {
    borderRadius: 10,
    padding: Spacing.three,
    marginTop: Spacing.four,
    marginBottom: Spacing.five,
  },
  logout: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.four,
  },
});
