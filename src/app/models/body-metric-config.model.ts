export interface BodyMetricSegment {
  label: string;
  min: number;
  max: number;
  color: string;
}

export interface BodyMetricConfig {
  /** Metric type, e.g., 'weight', 'bmi', etc. */
  type: string;
  /** Custom segments for the gauge */
  segments: BodyMetricSegment[];
  /** Optional unit override, defaults to service defaults */
  unit?: string;
}

export interface BodyMetricDefinition {
  type: 'weight' | 'bmi' | 'bodyFat' | 'muscle' | 'water' | 'protein' | 'bmr' | 'visceralFat' | 'boneMass';
  label: string;
  unit: string;
  min: number;
  max: number;
  defaultSegments: BodyMetricSegment[];
}

export const DEFAULT_BODY_METRIC_DEFINITIONS: Record<string, BodyMetricDefinition> = {
  weight: {
    type: 'weight',
    label: 'Peso Corporeo',
    unit: 'kg',
    min: 45,
    max: 110,
    defaultSegments: [
      { label: 'Sottopeso', min: 45, max: 53.5, color: '#0284c7' },
      { label: 'Bilanciato', min: 53.5, max: 72.3, color: '#10b981' },
      { label: 'Sovrappeso', min: 72.3, max: 86.7, color: '#f59e0b' },
      { label: 'Obeso', min: 86.7, max: 110, color: '#ef4444' }
    ]
  },
  bmi: {
    type: 'bmi',
    label: 'Indice di Massa Corporea (BMI)',
    unit: '',
    min: 15,
    max: 35,
    defaultSegments: [
      { label: 'Basso', min: 15, max: 18.5, color: '#0284c7' },
      { label: 'Normale', min: 18.5, max: 25.0, color: '#10b981' },
      { label: 'Alto', min: 25.0, max: 30.0, color: '#f59e0b' },
      { label: 'Molto alto', min: 30.0, max: 35, color: '#ef4444' }
    ]
  },
  bodyFat: {
    type: 'bodyFat',
    label: 'Massa Grassa',
    unit: '%',
    min: 5,
    max: 35,
    defaultSegments: [
      { label: 'Molto basso', min: 5, max: 11.0, color: '#0284c7' },
      { label: 'Basso', min: 11.0, max: 17.0, color: '#0ea5e9' },
      { label: 'Normale', min: 17.0, max: 22.0, color: '#10b981' },
      { label: 'Aumentato', min: 22.0, max: 27.0, color: '#f59e0b' },
      { label: 'Alto', min: 27.0, max: 35, color: '#ef4444' }
    ]
  },
  muscle: {
    type: 'muscle',
    label: 'Massa Muscolare',
    unit: 'kg',
    min: 40,
    max: 75,
    defaultSegments: [
      { label: 'Insufficiente', min: 40, max: 49.5, color: '#f59e0b' },
      { label: 'Normale', min: 49.5, max: 59.4, color: '#0284c7' },
      { label: 'Buono', min: 59.4, max: 75, color: '#10b981' }
    ]
  },
  water: {
    type: 'water',
    label: 'Acqua Corporea',
    unit: '%',
    min: 40,
    max: 75,
    defaultSegments: [
      { label: 'Insufficiente', min: 40, max: 55.0, color: '#ef4444' },
      { label: 'Normale', min: 55.0, max: 65.0, color: '#f59e0b' },
      { label: 'Buono', min: 65.0, max: 75, color: '#10b981' }
    ]
  },
  protein: {
    type: 'protein',
    label: 'Proteine',
    unit: '%',
    min: 12,
    max: 24,
    defaultSegments: [
      { label: 'Insufficiente', min: 12, max: 16.0, color: '#ef4444' },
      { label: 'Normale', min: 16.0, max: 18.0, color: '#f59e0b' },
      { label: 'Buono', min: 18.0, max: 24, color: '#10b981' }
    ]
  },
  bmr: {
    type: 'bmr',
    label: 'Metabolismo Basale (BMR)',
    unit: 'kcal',
    min: 1400,
    max: 2400,
    defaultSegments: [
      { label: 'Basso', min: 1400, max: 1800, color: '#0284c7' },
      { label: 'Medio', min: 1800, max: 2084, color: '#f59e0b' },
      { label: 'Ottimale', min: 2084, max: 2400, color: '#10b981' }
    ]
  },
  visceralFat: {
    type: 'visceralFat',
    label: 'Grasso Viscerale',
    unit: '',
    min: 1,
    max: 25,
    defaultSegments: [
      { label: 'Normale', min: 1, max: 10, color: '#10b981' },
      { label: 'Alto', min: 10, max: 15, color: '#f59e0b' },
      { label: 'Molto alto', min: 15, max: 25, color: '#ef4444' }
    ]
  },
  boneMass: {
    type: 'boneMass',
    label: 'Massa Ossea',
    unit: 'kg',
    min: 2.0,
    max: 5.0,
    defaultSegments: [
      { label: 'Insufficiente', min: 2.0, max: 3.2, color: '#ef4444' },
      { label: 'Normale', min: 3.2, max: 4.2, color: '#10b981' },
      { label: 'Buono', min: 4.2, max: 5.0, color: '#059669' }
    ]
  }
};
export type UserMetricConfigs = Record<string, BodyMetricConfig>;

export function getDefaultMetricDefinition(
  type: string,
  userName?: 'Angelo' | 'Daiana'
): BodyMetricDefinition {
  const base = DEFAULT_BODY_METRIC_DEFINITIONS[type] ?? DEFAULT_BODY_METRIC_DEFINITIONS['weight'];

  if (userName === 'Daiana') {
    if (type === 'bodyFat') {
      return {
        ...base,
        min: 10,
        max: 45,
        defaultSegments: [
          { label: 'Molto basso', min: 10, max: 18.0, color: '#0284c7' },
          { label: 'Basso', min: 18.0, max: 22.0, color: '#0ea5e9' },
          { label: 'Normale', min: 22.0, max: 28.0, color: '#10b981' },
          { label: 'Aumentato', min: 28.0, max: 35.0, color: '#f59e0b' },
          { label: 'Alto', min: 35.0, max: 45, color: '#ef4444' }
        ]
      };
    }
    if (type === 'muscle') {
      return {
        ...base,
        min: 30,
        max: 60,
        defaultSegments: [
          { label: 'Insufficiente', min: 30, max: 37.0, color: '#f59e0b' },
          { label: 'Normale', min: 37.0, max: 47.0, color: '#0284c7' },
          { label: 'Buono', min: 47.0, max: 60, color: '#10b981' }
        ]
      };
    }
    if (type === 'water') {
      return {
        ...base,
        min: 35,
        max: 70,
        defaultSegments: [
          { label: 'Insufficiente', min: 35, max: 50.0, color: '#ef4444' },
          { label: 'Normale', min: 50.0, max: 60.0, color: '#f59e0b' },
          { label: 'Buono', min: 60.0, max: 70, color: '#10b981' }
        ]
      };
    }
    if (type === 'boneMass') {
      return {
        ...base,
        min: 1.5,
        max: 4.0,
        defaultSegments: [
          { label: 'Insufficiente', min: 1.5, max: 2.2, color: '#ef4444' },
          { label: 'Normale', min: 2.2, max: 2.8, color: '#10b981' },
          { label: 'Buono', min: 2.8, max: 4.0, color: '#059669' }
        ]
      };
    }
  }

  return base;
}
