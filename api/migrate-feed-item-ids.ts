import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Configuración de Supabase
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Función para determinar si un ID ya es compuesto (contiene un UUID seguido de un guión)
function isCompositeId(id: string): boolean {
  // Un ID compuesto debe empezar con un UUID (8-4-4-4-12 format) seguido de un guión
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i;
  return uuidPattern.test(id);
}

// Función para extraer el ID original de un ID compuesto o devolver el ID tal como está
function extractOriginalId(id: string): string {
  if (isCompositeId(id)) {
    // Buscar el primer UUID en el formato y quitar todo hasta el guión después de él
    const match = id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-(.*)/i);
    return match ? match[1] : id;
  }
  return id;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    console.log('🔄 Starting feed item ID migration...');

    // 1. Obtener todos los elementos de feed que NO tienen formato de ID compuesto
    const { data: feedItems, error: fetchError } = await supabase
      .from('feed_items')
      .select('id, feed_id, title')
      .order('created_at', { ascending: true });

    if (fetchError) {
      console.error('❌ Error fetching feed items:', fetchError);
      return res.status(500).json({ 
        error: 'Failed to fetch feed items',
        details: fetchError 
      });
    }

    console.log(`📊 Found ${feedItems?.length || 0} total feed items`);

    // Filtrar elementos que NO tienen ID compuesto
    const itemsToMigrate = (feedItems || []).filter(item => !isCompositeId(item.id));
    
    console.log(`🎯 Found ${itemsToMigrate.length} items that need migration`);

    if (itemsToMigrate.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No items need migration - all IDs are already in composite format',
        migratedCount: 0,
        totalCount: feedItems?.length || 0
      });
    }

    // 2. Preparar las actualizaciones
    const updates = itemsToMigrate.map(item => {
      const originalId = extractOriginalId(item.id);
      const newCompositeId = `${item.feed_id}-${originalId}`;
      
      return {
        oldId: item.id,
        newId: newCompositeId,
        feedId: item.feed_id,
        title: item.title
      };
    });

    console.log(`🔄 Preparing to migrate ${updates.length} items...`);
    
    // Mostrar algunos ejemplos de lo que se va a hacer
    if (updates.length > 0) {
      console.log('📝 Migration examples:');
      updates.slice(0, 3).forEach(update => {
        console.log(`  ${update.oldId} -> ${update.newId}`);
      });
    }

    // 3. Realizar las actualizaciones en lotes para evitar problemas de rendimiento
    const batchSize = 100;
    let migratedCount = 0;
    const errors: any[] = [];

    for (let i = 0; i < updates.length; i += batchSize) {
      const batch = updates.slice(i, i + batchSize);
      console.log(`🔄 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(updates.length / batchSize)} (${batch.length} items)...`);

      // Procesar cada elemento en el lote
      for (const update of batch) {
        try {
          // Primero, verificar si el nuevo ID ya existe
          const { data: existingItem } = await supabase
            .from('feed_items')
            .select('id')
            .eq('id', update.newId)
            .single();

          if (existingItem) {
            console.log(`⚠️ Skipping ${update.oldId} - composite ID ${update.newId} already exists`);
            continue;
          }

          // Actualizar el ID del elemento
          const { error: updateError } = await supabase
            .from('feed_items')
            .update({ id: update.newId })
            .eq('id', update.oldId);

          if (updateError) {
            console.error(`❌ Error updating ${update.oldId}:`, updateError);
            errors.push({ item: update, error: updateError });
          } else {
            migratedCount++;
            if (migratedCount % 50 === 0) {
              console.log(`✅ Migrated ${migratedCount}/${updates.length} items...`);
            }
          }
        } catch (itemError) {
          console.error(`❌ Exception updating ${update.oldId}:`, itemError);
          errors.push({ item: update, error: itemError });
        }
      }

      // Pequeña pausa entre lotes para no sobrecargar la base de datos
      if (i + batchSize < updates.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`🎉 Migration completed! Migrated ${migratedCount}/${updates.length} items`);

    if (errors.length > 0) {
      console.log(`⚠️ ${errors.length} errors occurred during migration`);
    }

    return res.status(200).json({
      success: true,
      message: `Migration completed successfully`,
      migratedCount,
      totalCount: feedItems?.length || 0,
      itemsToMigrate: itemsToMigrate.length,
      errorCount: errors.length,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined // Solo devolver los primeros 10 errores
    });

  } catch (error) {
    console.error('💥 Migration error:', error);
    return res.status(500).json({
      success: false,
      error: 'Migration failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      details: error
    });
  }
} 