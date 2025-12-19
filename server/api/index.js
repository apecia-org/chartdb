const express = require('express');
const mariadb = require('mariadb');
const cors = require('cors');
const asyncHandler = require('express-async-handler');

const app = express();

// Middleware
app.use(express.json());
app.use(cors({
  origin: '*',///['http://localhost:3000','http://localhost:80', 'http://localhost:8080', 'http://host.docker.internal:5173', 'http://host.docker.internal:8080'],
  methods: ['GET', 'PUT', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));

// Database connection pool
const pool = mariadb.createPool({
  host: process.env.DATABASE_HOST || 'localhost',
  port: process.env.DATABASE_PORT || 3306,
  user: process.env.DATABASE_USER || 'root',
  password: process.env.DATABASE_PASSWORD || '',
  database: process.env.DATABASE_NAME || 'chartdb',
  connectionLimit: 5
});

// Config endpoints
app.get('/config', asyncHandler(async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const result = await conn.query('SELECT * FROM config WHERE id = 1');
    res.json(result[0] || {});
  } finally {
    conn.release();
  }
}));

app.put('/config', asyncHandler(async (req, res) => {
  const { defaultDiagramId } = req.body;
  if (!defaultDiagramId && defaultDiagramId !== '') {
    return res.status(400).json({ error: 'Missing defaultDiagramId' });
  }
  const conn = await pool.getConnection();
  try {
    await conn.query(
      'INSERT INTO config (id, default_diagram_id) VALUES (1, ?) ON DUPLICATE KEY UPDATE default_diagram_id = ?',
      [defaultDiagramId, defaultDiagramId]
    );
    res.status(204).send();
  } finally {
    conn.release();
  }
}));

// Diagram filter endpoints
app.get('/diagram-filters/:diagramId', asyncHandler(async (req, res) => {
  const { diagramId } = req.params;
  const conn = await pool.getConnection();
  try {
    const result = await conn.query('SELECT table_ids AS tableIds, schemas_ids AS schemasIds FROM diagram_filters WHERE diagram_id = ?', [diagramId]);
    res.json(result[0] ? { diagramId, tableIds: result[0].tableIds || null, schemasIds: result[0].schemasIds || null} : undefined);
  } finally {
    conn.release();
  }
}));

app.put('/diagram-filters/:diagramId', asyncHandler(async (req, res) => {
  const { diagramId } = req.params;
  const { tableIds, schemasIds } = req.body;
  // if (!tableIds || !schemasIds) {
  //   return res.status(400).json({ error: 'Missing tableIds or schemasIds' });
  // }
  const conn = await pool.getConnection();
  try {
    // null == no filter (all table visible)
    // [] = got filter (id of visible table will be in array, no id = no table visible)
    let valid_tableId = tableIds && tableIds.length >= 0 ? JSON.stringify(tableIds) : "null"
    let valid_schemaId = schemasIds && schemasIds.length >= 0? JSON.stringify(schemasIds): "null"
    await conn.query(
      'INSERT INTO diagram_filters (diagram_id, table_ids, schemas_ids) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE table_ids = ?, schemas_ids = ?',
      [diagramId, valid_tableId, valid_schemaId, valid_tableId, valid_schemaId]
    );
    res.status(204).send();
  } finally {
    conn.release();
  }
}));

app.delete('/diagram-filters/:diagramId', asyncHandler(async (req, res) => {
  const { diagramId } = req.params;
  const conn = await pool.getConnection();
  try {
    await conn.query('DELETE FROM diagram_filters WHERE diagram_id = ?', [diagramId]);
    res.status(204).send();
  } finally {
    conn.release();
  }
}));

// Diagram endpoints
app.post('/diagrams', asyncHandler(async (req, res) => {
  const { diagram } = req.body;
  if (!diagram || typeof diagram !== 'object') {
    return res.status(400).json({ error: 'Invalid or missing diagram object' });
  }
  const { id, name, databaseType, databaseEdition, createdAt, updatedAt } = diagram;
  if (!id || !name || !databaseType) {
    return res.status(400).json({ error: 'Missing required fields: id, name, or databaseType' });
  }
  const conn = await pool.getConnection();
  try {
    await conn.query(
      'INSERT INTO diagrams (id, name, database_type, database_edition, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, name, databaseType, databaseEdition || null, createdAt || new Date().toISOString(), updatedAt || new Date().toISOString()]
    );
    res.status(204).send();
  } finally {
    conn.release();
  }
}));

app.get('/diagrams', asyncHandler(async (req, res) => {
  const { includeTables, includeRelationships, includeDependencies, includeAreas, includeCustomTypes } = req.query;
  const conn = await pool.getConnection();
  try {
    const diagrams = await conn.query('SELECT id, name, database_type AS databaseType, database_edition AS databaseEdition, created_at AS createdAt, updated_at AS updatedAt FROM diagrams');
    if (includeTables === 'true' || includeRelationships === 'true' || includeDependencies === 'true' || includeAreas === 'true' || includeCustomTypes === 'true') {
      for (let diagram of diagrams) {
        if (includeTables === 'true') {
          const tables = await conn.query('SELECT id, diagram_id AS diagramId, name, `schema`, x, y, fields, indexes, color, created_at AS createdAt, width, comment, is_view AS isView, is_materialized_view AS isMaterializedView, `order` FROM db_tables WHERE diagram_id = ?', [diagram.id]);
          diagram.tables = tables.map(t => ({ ...t, fields: t.fields || [], indexes: t.indexes ||[] }));
        }
        if (includeRelationships === 'true') {
          diagram.relationships = await conn.query(
            'SELECT id, diagram_id AS diagramId, name, source_schema AS sourceSchema, source_table_id AS sourceTableId, target_schema AS targetSchema, target_table_id AS targetTableId, source_field_id AS sourceFieldId, target_field_id AS targetFieldId, type, source_cardinality AS sourceCardinality, target_cardinality AS targetCardinality, created_at AS createdAt FROM db_relationships WHERE diagram_id = ?',
            [diagram.id]
          );
        }
        if (includeDependencies === 'true') {
          diagram.dependencies = await conn.query(
            'SELECT id, diagram_id AS diagramId, `schema`, table_id AS tableId, dependent_schema AS dependentSchema, dependent_table_id AS dependentTableId, created_at AS createdAt FROM db_dependencies WHERE diagram_id = ?',
            [diagram.id]
          );
        }
        if (includeAreas === 'true') {
          diagram.areas = await conn.query('SELECT id, diagram_id AS diagramId, name, x, y, width, height, color FROM areas WHERE diagram_id = ?', [diagram.id]);
        }
        if (includeCustomTypes === 'true') {
          const customTypes = await conn.query('SELECT id, diagram_id AS diagramId, `schema`, type, kind, `values`, fields FROM db_custom_types WHERE diagram_id = ?', [diagram.id]);
          diagram.customTypes = customTypes.map(ct => ({ ...ct, values: ct.values || [], fields: ct.fields || [] }));
        }
      }
    }
    res.json(diagrams);
  } finally {
    conn.release();
  }
}));

app.get('/diagrams/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { includeTables, includeRelationships, includeDependencies, includeAreas, includeCustomTypes } = req.query;
  const conn = await pool.getConnection();
  try {
    const result = await conn.query('SELECT id, name, database_type AS databaseType, database_edition AS databaseEdition, created_at AS createdAt, updated_at AS updatedAt FROM diagrams WHERE id = ?', [id]);
    const diagram = result[0];
    if (!diagram) {
      return res.status(404).json({ error: 'Diagram not found' });
    }
    if (includeTables === 'true') {
      const tables = await conn.query('SELECT id, diagram_id AS diagramId, name, `schema`, x, y, fields, indexes, color, created_at AS createdAt, width, comment, is_view AS isView, is_materialized_view AS isMaterializedView, `order` FROM db_tables WHERE diagram_id = ?', [id]);
      diagram.tables = tables.map(t => ({ ...t, fields: t.fields || [], indexes: t.indexes || [] }));
    }
    if (includeRelationships === 'true') {
      diagram.relationships = await conn.query(
        'SELECT id, diagram_id AS diagramId, name, source_schema AS sourceSchema, source_table_id AS sourceTableId, target_schema AS targetSchema, target_table_id AS targetTableId, source_field_id AS sourceFieldId, target_field_id AS targetFieldId, type, source_cardinality AS sourceCardinality, target_cardinality AS targetCardinality, created_at AS createdAt FROM db_relationships WHERE diagram_id = ?',
        [id]
      );
    }
    if (includeDependencies === 'true') {
      diagram.dependencies = await conn.query(
        'SELECT id, diagram_id AS diagramId, `schema`, table_id AS tableId, dependent_schema AS dependentSchema, dependent_table_id AS dependentTableId, created_at AS createdAt FROM db_dependencies WHERE diagram_id = ?',
        [id]
      );
    }
    if (includeAreas === 'true') {
      diagram.areas = await conn.query('SELECT id, diagram_id AS diagramId, name, x, y, width, height, color FROM areas WHERE diagram_id = ?', [id]);
    }
    if (includeCustomTypes === 'true') {
      const customTypes = await conn.query('SELECT id, diagram_id AS diagramId, `schema`, type, kind, `values`, fields FROM db_custom_types WHERE diagram_id = ?', [id]);
      diagram.customTypes = customTypes.map(ct => ({ ...ct, values: ct.values || [], fields: ct.fields || [] }));
    }
    res.json(diagram);
  } finally {
    conn.release();
  }
}));

app.patch('/diagrams/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { attributes } = req.body;
  if (!attributes || typeof attributes !== 'object') {
    return res.status(400).json({ error: 'Invalid or missing attributes' });
  }
  const conn = await pool.getConnection();
  try {
    const fields = Object.keys(attributes).map(key => {
      if (key === 'databaseType') return 'database_type = ?';
      if (key === 'databaseEdition') return 'database_edition = ?';
      if (key === 'createdAt') return 'created_at = ?';
      if (key === 'updatedAt') return 'updated_at = ?';
      return `${key} = ?`;
    }).join(', ');
    const values = Object.keys(attributes).map(key => attributes[key]);
    await conn.query(`UPDATE diagrams SET ${fields}, updated_at = NOW() WHERE id = ?`, [...values, id]);
    if (attributes.id && attributes.id !== id) {
      await Promise.all([
        conn.query('UPDATE db_tables SET diagram_id = ? WHERE diagram_id = ?', [attributes.id, id]),
        conn.query('UPDATE db_relationships SET diagram_id = ? WHERE diagram_id = ?', [attributes.id, id]),
        conn.query('UPDATE db_dependencies SET diagram_id = ? WHERE diagram_id = ?', [attributes.id, id]),
        conn.query('UPDATE areas SET diagram_id = ? WHERE diagram_id = ?', [attributes.id, id]),
        conn.query('UPDATE db_custom_types SET diagram_id = ? WHERE diagram_id = ?', [attributes.id, id]),
        conn.query('UPDATE diagram_filters SET diagram_id = ? WHERE diagram_id = ?', [attributes.id, id]),
      ]);
    }
    res.status(204).send();
  } finally {
    conn.release();
  }
}));

app.delete('/diagrams/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await Promise.all([
      conn.query('DELETE FROM diagrams WHERE id = ?', [id]),
      conn.query('DELETE FROM db_tables WHERE diagram_id = ?', [id]),
      conn.query('DELETE FROM db_relationships WHERE diagram_id = ?', [id]),
      conn.query('DELETE FROM db_dependencies WHERE diagram_id = ?', [id]),
      conn.query('DELETE FROM areas WHERE diagram_id = ?', [id]),
      conn.query('DELETE FROM db_custom_types WHERE diagram_id = ?', [id]),
      conn.query('DELETE FROM diagram_filters WHERE diagram_id = ?', [id]),
    ]);
    await conn.commit();
    res.status(204).send();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}));

// Table endpoints
app.post('/diagrams/:diagramId/tables', asyncHandler(async (req, res) => {
  const { diagramId } = req.params;
  const { table } = req.body;
  if (!table || typeof table !== 'object') {
    return res.status(400).json({ error: 'Invalid or missing table object' });
  }
  const { id, name, schema, x, y, fields, indexes, color, createdAt, width, comment, isView, isMaterializedView, order } = table;
  if (!id || !name) {
    return res.status(400).json({ error: 'Missing required fields: id or name' });
  }
  const conn = await pool.getConnection();
  try {
    await conn.query(
      'INSERT INTO db_tables (id, diagram_id, name, `schema`, x, y, fields, indexes, color, created_at, width, comment, is_view, is_materialized_view, `order`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        id,
        diagramId,
        name,
        schema || null,
        x || null,
        y || null,
        JSON.stringify(fields || []),
        JSON.stringify(indexes || []),
        color || null,
        createdAt || new Date().toISOString(),
        width || null,
        comment || null,
        isView || false,
        isMaterializedView || false,
        order || null
      ]
    );
    res.status(204).send();
  } finally {
    conn.release();
  }
}));

app.get('/diagrams/:diagramId/tables/:id', asyncHandler(async (req, res) => {
  const { diagramId, id } = req.params;
  const conn = await pool.getConnection();
  try {
    const result = await conn.query(
      'SELECT id, diagram_id AS diagramId, name, `schema`, x, y, fields, indexes, color, created_at AS createdAt, width, comment, is_view AS isView, is_materialized_view AS isMaterializedView, `order` FROM db_tables WHERE diagram_id = ? AND id = ?',
      [diagramId, id]
    );
    if (!result[0]) {
      return res.status(404).json({ error: 'Table not found' });
    }
    res.json({ ...result[0], fields: result[0].fields || [], indexes: result[0].indexes || [] });
  } finally {
    conn.release();
  }
}));

app.patch('/tables/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { attributes } = req.body;
  if (!attributes || typeof attributes !== 'object') {
    return res.status(400).json({ error: 'Invalid or missing attributes' });
  }
  const conn = await pool.getConnection();
  try {
    const fields = Object.keys(attributes).map(key => {
      if (key === 'createdAt') return 'created_at = ?';

      if (key === 'diagramId') return 'diagram_id = ?';
      if (['fields', 'indexes'].includes(key)) return `${key} = ?`;
      if (key === 'isView') return 'is_view = ?';
      if (key === 'isMaterializedView') return 'is_materialized_view = ?';
      if (key === 'order') return '`order` = ?';
      return `\`${key}\` = ?`;
    }).join(', ');
    const values = Object.entries(attributes).map(([key, value]) => {
      if (['fields', 'indexes'].includes(key)) return JSON.stringify(value || []);
      return value;
    });
    await conn.query(`UPDATE db_tables SET ${fields} WHERE id = ?`, [...values, id]);
    res.status(204).send();
  } finally {
    conn.release();
  }
}));

app.put('/diagrams/:diagramId/tables', asyncHandler(async (req, res) => {
  const { diagramId } = req.params;
  const { table } = req.body;
  if (!table || typeof table !== 'object') {
    return res.status(400).json({ error: 'Invalid or missing table object' });
  }
  const { id, name, schema, x, y, fields, indexes, color, createdAt, width, comment, isView, isMaterializedView, order } = table;
  if (!id || !name) {
    return res.status(400).json({ error: 'Missing required fields: id or name' });
  }
  const conn = await pool.getConnection();
  try {
    await conn.query(
      'INSERT INTO db_tables (id, diagram_id, name, `schema`, x, y, fields, indexes, color, created_at, width, comment, is_view, is_materialized_view, `order`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = ?, `schema` = ?, x = ?, y = ?, fields = ?, indexes = ?, color = ?, created_at = ?, width = ?, comment = ?, is_view = ?, is_materialized_view = ?, `order` = ?',
      [
        id, diagramId, name, schema || null, x || null, y || null, JSON.stringify(fields || []), JSON.stringify(indexes || []), color || null, createdAt || new Date().toISOString(), width || null, comment || null, isView || false, isMaterializedView || false, order || null,
        name, schema || null, x || null, y || null, JSON.stringify(fields || []), JSON.stringify(indexes || []), color || null, createdAt || new Date().toISOString(), width || null, comment || null, isView || false, isMaterializedView || false, order || null
      ]
    );
    res.status(204).send();
  } finally {
    conn.release();
  }
}));

app.delete('/diagrams/:diagramId/tables/:id', asyncHandler(async (req, res) => {
  const { diagramId, id } = req.params;
  const conn = await pool.getConnection();
  try {
    await conn.query('DELETE FROM db_tables WHERE diagram_id = ? AND id = ?', [diagramId, id]);
    res.status(204).send();
  } finally {
    conn.release();
  }
}));

app.get('/diagrams/:diagramId/tables', asyncHandler(async (req, res) => {
  const { diagramId } = req.params;
  const conn = await pool.getConnection();
  try {
    const result = await conn.query(
      'SELECT id, diagram_id AS diagramId, name, `schema`, x, y, fields, indexes, color, created_at AS createdAt, width, comment, is_view AS isView, is_materialized_view AS isMaterializedView, `order` FROM db_tables WHERE diagram_id = ?',
      [diagramId]
    );
    res.json(result.map(t => ({ ...t, fields: t.fields || [], indexes: t.indexes || [] })));
  } finally {
    conn.release();
  }
}));

app.delete('/diagrams/:diagramId/tables', asyncHandler(async (req, res) => {
  const { diagramId } = req.params;
  const conn = await pool.getConnection();
  try {
    await conn.query('DELETE FROM db_tables WHERE diagram_id = ?', [diagramId]);
    res.status(204).send();
  } finally {
    conn.release();
  }
}));

// Relationship endpoints
app.post('/diagrams/:diagramId/relationships', asyncHandler(async (req, res) => {
  const { diagramId } = req.params;
  const { relationship } = req.body;
  if (!relationship || typeof relationship !== 'object') {
    return res.status(400).json({ error: 'Invalid or missing relationship object' });
  }
  const { id, name, sourceSchema, sourceTableId, targetSchema, targetTableId, sourceFieldId, targetFieldId, type, sourceCardinality, targetCardinality, createdAt } = relationship;
  if (!id || !sourceTableId || !targetTableId) {
    return res.status(400).json({ error: 'Missing required fields: id, sourceTableId, or targetTableId' });
  }
  const conn = await pool.getConnection();
  try {
    await conn.query(
      'INSERT INTO db_relationships (id, diagram_id, name, source_schema, source_table_id, target_schema, target_table_id, source_field_id, target_field_id, type, source_cardinality, target_cardinality, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        id,
        diagramId,
        name || null,
        sourceSchema || null,
        sourceTableId,
        targetSchema || null,
        targetTableId,
        sourceFieldId || null,
        targetFieldId || null,
        type || null,
        sourceCardinality || null,
        targetCardinality || null,
        createdAt || new Date().toISOString()
      ]
    );
    res.status(204).send();
  } finally {
    conn.release();
  }
}));

app.get('/diagrams/:diagramId/relationships/:id', asyncHandler(async (req, res) => {
  const { diagramId, id } = req.params;
  const conn = await pool.getConnection();
  try {
    const result = await conn.query(
      'SELECT id, diagram_id AS diagramId, name, source_schema AS sourceSchema, source_table_id AS sourceTableId, target_schema AS targetSchema, target_table_id AS targetTableId, source_field_id AS sourceFieldId, target_field_id AS targetFieldId, type, source_cardinality AS sourceCardinality, target_cardinality AS targetCardinality, created_at AS createdAt FROM db_relationships WHERE diagram_id = ? AND id = ?',
      [diagramId, id]
    );
    if (!result[0]) {
      return res.status(404).json({ error: 'Relationship not found' });
    }
    res.json(result[0]);
  } finally {
    conn.release();
  }
}));

app.patch('/relationships/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { attributes } = req.body;
  if (!attributes || typeof attributes !== 'object') {
    return res.status(400).json({ error: 'Invalid or missing attributes' });
  }
  const conn = await pool.getConnection();
  try {
    const fields = Object.keys(attributes).map(key => {
      if (key === 'sourceSchema') return 'source_schema = ?';
      if (key === 'sourceTableId') return 'source_table_id = ?';
      if (key === 'targetSchema') return 'target_schema = ?';
      if (key === 'targetTableId') return 'target_table_id = ?';
      if (key === 'sourceFieldId') return 'source_field_id = ?';
      if (key === 'targetFieldId') return 'target_field_id = ?';
      if (key === 'sourceCardinality') return 'source_cardinality = ?';
      if (key === 'targetCardinality') return 'target_cardinality = ?';
      if (key === 'createdAt') return 'created_at = ?';
      return `${key} = ?`;
    }).join(', ');
    const values = Object.values(attributes);
    await conn.query(`UPDATE db_relationships SET ${fields} WHERE id = ?`, [...values, id]);
    res.status(204).send();
  } finally {
    conn.release();
  }
}));

app.delete('/diagrams/:diagramId/relationships/:id', asyncHandler(async (req, res) => {
  const { diagramId, id } = req.params;
  const conn = await pool.getConnection();
  try {
    await conn.query('DELETE FROM db_relationships WHERE diagram_id = ? AND id = ?', [diagramId, id]);
    res.status(204).send();
  } finally {
    conn.release();
  }
}));

app.get('/diagrams/:diagramId/relationships', asyncHandler(async (req, res) => {
  const { diagramId } = req.params;
  const conn = await pool.getConnection();
  try {
    const result = await conn.query(
      'SELECT id, diagram_id AS diagramId, name, source_schema AS sourceSchema, source_table_id AS sourceTableId, target_schema AS targetSchema, target_table_id AS targetTableId, source_field_id AS sourceFieldId, target_field_id AS targetFieldId, type, source_cardinality AS sourceCardinality, target_cardinality AS targetCardinality, created_at AS createdAt FROM db_relationships WHERE diagram_id = ? ORDER BY name',
      [diagramId]
    );
    res.json(result);
  } finally {
    conn.release();
  }
}));

app.delete('/diagrams/:diagramId/relationships', asyncHandler(async (req, res) => {
  const { diagramId } = req.params;
  const conn = await pool.getConnection();
  try {
    await conn.query('DELETE FROM db_relationships WHERE diagram_id = ?', [diagramId]);
    res.status(204).send();
  } finally {
    conn.release();
  }
}));

// Dependency endpoints
app.post('/diagrams/:diagramId/dependencies', asyncHandler(async (req, res) => {
  const { diagramId } = req.params;
  const { dependency } = req.body;
  if (!dependency || typeof dependency !== 'object') {
    return res.status(400).json({ error: 'Invalid or missing dependency object' });
  }
  const { id, schema, tableId, dependentSchema, dependentTableId, createdAt } = dependency;
  if (!id || !tableId || !dependentTableId) {
    return res.status(400).json({ error: 'Missing required fields: id, tableId, or dependentTableId' });
  }
  const conn = await pool.getConnection();
  try {
    await conn.query(
      'INSERT INTO db_dependencies (id, diagram_id, `schema`, table_id, dependent_schema, dependent_table_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, diagramId, schema || null, tableId, dependentSchema || null, dependentTableId, createdAt || new Date().toISOString()]
    );
    res.status(204).send();
  } finally {
    conn.release();
  }
}));

app.get('/diagrams/:diagramId/dependencies/:id', asyncHandler(async (req, res) => {
  const { diagramId, id } = req.params;
  const conn = await pool.getConnection();
  try {
    const result = await conn.query(
      'SELECT id, diagram_id AS diagramId, `schema`, table_id AS tableId, dependent_schema AS dependentSchema, dependent_table_id AS dependentTableId, created_at AS createdAt FROM db_dependencies WHERE diagram_id = ? AND id = ?',
      [diagramId, id]
    );
    if (!result[0]) {
      return res.status(404).json({ error: 'Dependency not found' });
    }
    res.json(result[0]);
  } finally {
    conn.release();
  }
}));

app.patch('/dependencies/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { attributes } = req.body;
  if (!attributes || typeof attributes !== 'object') {
    return res.status(400).json({ error: 'Invalid or missing attributes' });
  }
  const conn = await pool.getConnection();
  try {
    const fields = Object.keys(attributes).map(key => {
      if (key === 'tableId') return 'table_id = ?';
      if (key === 'dependentSchema') return 'dependent_schema = ?';
      if (key === 'dependentTableId') return 'dependent_table_id = ?';
      if (key === 'createdAt') return 'created_at = ?';
      return `${key} = ?`;
    }).join(', ');
    const values = Object.values(attributes);
    await conn.query(`UPDATE db_dependencies SET ${fields} WHERE id = ?`, [...values, id]);
    res.status(204).send();
  } finally {
    conn.release();
  }
}));

app.delete('/diagrams/:diagramId/dependencies/:id', asyncHandler(async (req, res) => {
  const { diagramId, id } = req.params;
  const conn = await pool.getConnection();
  try {
    await conn.query('DELETE FROM db_dependencies WHERE diagram_id = ? AND id = ?', [diagramId, id]);
    res.status(204).send();
  } finally {
    conn.release();
  }
}));

app.get('/diagrams/:diagramId/dependencies', asyncHandler(async (req, res) => {
  const { diagramId } = req.params;
  const conn = await pool.getConnection();
  try {
    const result = await conn.query(
      'SELECT id, diagram_id AS diagramId, `schema`, table_id AS tableId, dependent_schema AS dependentSchema, dependent_table_id AS dependentTableId, created_at AS createdAt FROM db_dependencies WHERE diagram_id = ?',
      [diagramId]
    );
    res.json(result);
  } finally {
    conn.release();
  }
}));

app.delete('/diagrams/:diagramId/dependencies', asyncHandler(async (req, res) => {
  const { diagramId } = req.params;
  const conn = await pool.getConnection();
  try {
    await conn.query('DELETE FROM db_dependencies WHERE diagram_id = ?', [diagramId]);
    res.status(204).send();
  } finally {
    conn.release();
  }
}));

// Area endpoints
app.post('/diagrams/:diagramId/areas', asyncHandler(async (req, res) => {
  const { diagramId } = req.params;
  const { area } = req.body;
  if (!area || typeof area !== 'object') {
    return res.status(400).json({ error: 'Invalid or missing area object' });
  }
  const { id, name, x, y, width, height, color } = area;
  if (!id || !name) {
    return res.status(400).json({ error: 'Missing required fields: id or name' });
  }
  const conn = await pool.getConnection();
  try {
    await conn.query(
      'INSERT INTO areas (id, diagram_id, name, x, y, width, height, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, diagramId, name, x || null, y || null, width || null, height || null, color || null]
    );
    res.status(204).send();
  } finally {
    conn.release();
  }
}));

app.get('/diagrams/:diagramId/areas/:id', asyncHandler(async (req, res) => {
  const { diagramId, id } = req.params;
  const conn = await pool.getConnection();
  try {
    const result = await conn.query(
      'SELECT id, diagram_id AS diagramId, name, x, y, width, height, color FROM areas WHERE diagram_id = ? AND id = ?',
      [diagramId, id]
    );
    if (!result[0]) {
      return res.status(404).json({ error: 'Area not found' });
    }
    res.json(result[0]);
  } finally {
    conn.release();
  }
}));

app.patch('/areas/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { attributes } = req.body;
  if (!attributes || typeof attributes !== 'object') {
    return res.status(400).json({ error: 'Invalid or missing attributes' });
  }
  const conn = await pool.getConnection();
  try {
    const fields = Object.keys(attributes).map(key => `${key} = ?`).join(', ');
    const values = Object.values(attributes);
    await conn.query(`UPDATE areas SET ${fields} WHERE id = ?`, [...values, id]);
    res.status(204).send();
  } finally {
    conn.release();
  }
}));

app.delete('/diagrams/:diagramId/areas/:id', asyncHandler(async (req, res) => {
  const { diagramId, id } = req.params;
  const conn = await pool.getConnection();
  try {
    await conn.query('DELETE FROM areas WHERE diagram_id = ? AND id = ?', [diagramId, id]);
    res.status(204).send();
  } finally {
    conn.release();
  }
}));

app.get('/diagrams/:diagramId/areas', asyncHandler(async (req, res) => {
  const { diagramId } = req.params;
  const conn = await pool.getConnection();
  try {
    const result = await conn.query(
      'SELECT id, diagram_id AS diagramId, name, x, y, width, height, color FROM areas WHERE diagram_id = ?',
      [diagramId]
    );
    res.json(result);
  } finally {
    conn.release();
  }
}));

app.delete('/diagrams/:diagramId/areas', asyncHandler(async (req, res) => {
  const { diagramId } = req.params;
  const conn = await pool.getConnection();
  try {
    await conn.query('DELETE FROM areas WHERE diagram_id = ?', [diagramId]);
    res.status(204).send();
  } finally {
    conn.release();
  }
}));

// Custom type endpoints
app.post('/diagrams/:diagramId/custom-types', asyncHandler(async (req, res) => {
  const { diagramId } = req.params;
  const { customType } = req.body;
  if (!customType || typeof customType !== 'object') {
    return res.status(400).json({ error: 'Invalid or missing customType object' });
  }
  const { id, schema, type, kind, values, fields } = customType;
  if (!id || !type) {
    return res.status(400).json({ error: 'Missing required fields: id or type' });
  }
  const conn = await pool.getConnection();
  try {
    await conn.query(
      'INSERT INTO db_custom_types (id, diagram_id, `schema`, type, kind, `values`, fields) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, diagramId, schema || null, type, kind || null, JSON.stringify(values || []), JSON.stringify(fields || [])]
    );
    res.status(204).send();
  } finally {
    conn.release();
  }
}));

app.get('/diagrams/:diagramId/custom-types/:id', asyncHandler(async (req, res) => {
  const { diagramId, id } = req.params;
  const conn = await pool.getConnection();
  try {
    const result = await conn.query(
      'SELECT id, diagram_id AS diagramId, `schema`, type, kind, `values`, fields FROM db_custom_types WHERE diagram_id = ? AND id = ?',
      [diagramId, id]
    );
    if (!result[0]) {
      return res.status(404).json({ error: 'Custom type not found' });
    }
    res.json({ ...result[0], values: result[0].values || [], fields: result[0].fields || [] });
  } finally {
    conn.release();
  }
}));

app.patch('/custom-types/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { attributes } = req.body;
  if (!attributes || typeof attributes !== 'object') {
    return res.status(400).json({ error: 'Invalid or missing attributes' });
  }
  const conn = await pool.getConnection();
  try {
    const fields = Object.keys(attributes).map(key => {
      if (['values', 'fields'].includes(key)) return `${key} = ?`;
      return `${key} = ?`;
    }).join(', ');
    const values = Object.entries(attributes).map(([key, value]) => {
      if (['values', 'fields'].includes(key)) return JSON.stringify(value || []);
      return value;
    });
    await conn.query(`UPDATE db_custom_types SET ${fields} WHERE id = ?`, [...values, id]);
    res.status(204).send();
  } finally {
    conn.release();
  }
}));

app.delete('/diagrams/:diagramId/custom-types/:id', asyncHandler(async (req, res) => {
  const { diagramId, id } = req.params;
  const conn = await pool.getConnection();
  try {
    await conn.query('DELETE FROM db_custom_types WHERE diagram_id = ? AND id = ?', [diagramId, id]);
    res.status(204).send();
  } finally {
    conn.release();
  }
}));

app.get('/diagrams/:diagramId/custom-types', asyncHandler(async (req, res) => {
  const { diagramId } = req.params;
  const conn = await pool.getConnection();
  try {
    const result = await conn.query(
      'SELECT id, diagram_id AS diagramId, `schema`, type, kind, `values`, fields FROM db_custom_types WHERE diagram_id = ? ORDER BY type',
      [diagramId]
    );
    res.json(result.map(ct => ({ ...ct, values: ct.values || [], fields: ct.fields || [] })));
  } finally {
    conn.release();
  }
}));

app.delete('/diagrams/:diagramId/custom-types', asyncHandler(async (req, res) => {
  const { diagramId } = req.params;
  const conn = await pool.getConnection();
  try {
    await conn.query('DELETE FROM db_custom_types WHERE diagram_id = ?', [diagramId]);
    res.status(204).send();
  } finally {
    conn.release();
  }
}));

// Health check
app.get('/health', asyncHandler(async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.ping();
    res.status(200).json({ status: 'healthy' });
  } finally {
    conn.release();
  }
}));

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// Config initialization (mimics Dexie on('ready'))
const initializeConfig = async () => {
  const conn = await pool.getConnection();
  try {
    const config = await conn.query('SELECT * FROM config WHERE id = 1');
    if (!config[0]) {
      const diagrams = await conn.query('SELECT id FROM diagrams LIMIT 1');
      await conn.query(
        'INSERT INTO config (id, default_diagram_id) VALUES (1, ?)',
        [diagrams[0]?.id || '']
      );
    }
  } finally {
    conn.release();
  }
};

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await initializeConfig();
});