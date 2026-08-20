import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface DateTimeFieldProps {
  label: string;
  /** ISO 8601 datetime, or null until a value has been picked. */
  onChange: (isoDateTime: string | null) => void;
}

function mergeDatePart(base: Date, picked: Date) {
  const next = new Date(base);
  next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
  return next;
}

function mergeTimePart(base: Date, picked: Date) {
  const next = new Date(base);
  next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
  return next;
}

export function DateTimeField({ label, onChange }: DateTimeFieldProps) {
  const theme = useTheme();
  const [value, setValue] = useState<Date | null>(null);
  const [iosPicker, setIosPicker] = useState<'date' | 'time' | null>(null);

  function commit(next: Date) {
    setValue(next);
    onChange(next.toISOString());
  }

  function openAndroidPicker(mode: 'date' | 'time') {
    DateTimePickerAndroid.open({
      value: value ?? new Date(),
      mode,
      onChange: (event: DateTimePickerEvent, picked?: Date) => {
        if (event.type !== 'set' || !picked) return;
        const base = value ?? new Date();
        commit(mode === 'date' ? mergeDatePart(base, picked) : mergeTimePart(base, picked));
      },
    });
  }

  function openPicker(mode: 'date' | 'time') {
    if (Platform.OS === 'android') {
      openAndroidPicker(mode);
    } else {
      setIosPicker(mode);
    }
  }

  function onIosChange(mode: 'date' | 'time', event: DateTimePickerEvent, picked?: Date) {
    if (event.type !== 'set' || !picked) return;
    const base = value ?? new Date();
    commit(mode === 'date' ? mergeDatePart(base, picked) : mergeTimePart(base, picked));
  }

  const dateLabel = value ? value.toLocaleDateString('fr-CA') : 'Choisir une date';
  const timeLabel = value
    ? value.toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })
    : 'Choisir une heure';

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} — date`}
          style={[styles.field, { borderColor: theme.border, backgroundColor: theme.background }]}
          onPress={() => openPicker('date')}>
          <Text style={{ color: value ? theme.text : theme.textSecondary }}>{dateLabel}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} — heure`}
          style={[styles.field, { borderColor: theme.border, backgroundColor: theme.background }]}
          onPress={() => openPicker('time')}>
          <Text style={{ color: value ? theme.text : theme.textSecondary }}>{timeLabel}</Text>
        </Pressable>
      </View>

      {Platform.OS === 'ios' && iosPicker ? (
        <View style={styles.iosPicker}>
          <DateTimePicker
            value={value ?? new Date()}
            mode={iosPicker}
            display={iosPicker === 'date' ? 'inline' : 'spinner'}
            onChange={(event, picked) => onIosChange(iosPicker, event, picked)}
          />
          <Button title="Terminé" variant="ghost" onPress={() => setIosPicker(null)} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: Spacing.three,
  },
  label: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  field: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Radius.small,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
  },
  iosPicker: {
    marginTop: Spacing.two,
    alignItems: 'flex-end',
  },
});
