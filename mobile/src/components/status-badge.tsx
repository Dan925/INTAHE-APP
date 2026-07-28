import { StyleSheet, Text } from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import type { EventStatus } from '@/lib/events';

const LABELS: Record<EventStatus, string> = {
  draft: 'Brouillon',
  published: 'Publié',
  cancelled: 'Annulé',
  completed: 'Terminé',
};

export function StatusBadge({ status }: { status: EventStatus }) {
  const theme = useTheme();

  const { color, background } =
    status === 'published'
      ? { color: theme.success, background: theme.successSoft }
      : status === 'cancelled'
        ? { color: theme.destructive, background: theme.destructiveSoft }
        : { color: theme.textSecondary, background: theme.backgroundSelected };

  return (
    <Text style={[styles.badge, { color, backgroundColor: background }]}>{LABELS[status]}</Text>
  );
}

const styles = StyleSheet.create({
  badge: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
});
