import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface ListItemProps {
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: React.ReactNode;
}

export function ListItem({ title, subtitle, onPress, right }: ListItemProps) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={(state) => [
        styles.row,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border, opacity: state.pressed ? 0.7 : 1 },
      ]}>
      <View style={styles.text}>
        <ThemedText type="smallBold">{title}</ThemedText>
        {subtitle ? (
          <ThemedText type="small" themeColor="textSecondary">
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      {right}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: Radius.medium,
    padding: Spacing.three,
    marginBottom: Spacing.two,
  },
  text: {
    flex: 1,
    gap: 2,
  },
});
