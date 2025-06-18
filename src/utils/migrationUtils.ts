interface MigrationResult {
  success: boolean;
  message: string;
  migratedCount?: number;
  totalCount?: number;
  itemsToMigrate?: number;
  errorCount?: number;
  errors?: any[];
}

/**
 * Ejecuta la migración de IDs de elementos de feed para usar el formato compuesto [FEED-ID]-[URL-ID]
 */
export async function migrateFeedItemIds(): Promise<MigrationResult> {
  try {
    console.log('🔄 Iniciando migración de IDs de elementos de feed...');

    const response = await fetch('/api/migrate-feed-item-ids', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    const result: MigrationResult = await response.json();
    
    console.log('✅ Migración completada:', result);
    
    return result;
  } catch (error) {
    console.error('❌ Error en migración:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Error desconocido durante la migración',
    };
  }
}

/**
 * Verifica si un ID de elemento de feed está en formato compuesto
 */
export function isCompositeId(id: string): boolean {
  // Un ID compuesto debe empezar con un UUID (8-4-4-4-12 format) seguido de un guión
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i;
  return uuidPattern.test(id);
}

/**
 * Extrae el ID original de un ID compuesto
 */
export function extractOriginalId(id: string): string {
  if (isCompositeId(id)) {
    // Buscar el primer UUID en el formato y quitar todo hasta el guión después de él
    const match = id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-(.*)/i);
    return match ? match[1] : id;
  }
  return id;
}

/**
 * Crea un ID compuesto a partir del feedId y el ID original
 */
export function createCompositeId(feedId: string, originalId: string): string {
  return `${feedId}-${originalId}`;
} 