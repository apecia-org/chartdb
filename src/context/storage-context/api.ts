import type { StorageContext } from './storage-context';
import type { Diagram } from '@/lib/domain/diagram';
import type { DBTable } from '@/lib/domain/db-table';
import type { DBRelationship } from '@/lib/domain/db-relationship';
import type { DBDependency } from '@/lib/domain/db-dependency';
import type { Area } from '@/lib/domain/area';
import type { DBCustomType } from '@/lib/domain/db-custom-type';
import type { DiagramFilter } from '@/lib/domain/diagram-filter/diagram-filter';
import type { ChartDBConfig } from '@/lib/domain/config';

// Utility function to format ISO 8601 datetime to MariaDB-compatible format (YYYY-MM-DD HH:MM:SS)
const formatDateTime = (isoDate: Date | undefined): string => {
  if (!isoDate) return new Date().toISOString().slice(0, 19).replace('T', ' ');
  return isoDate.toISOString().slice(0, 19).replace('T', ' ');
};

const formatNumberDateTime = (isoDate: number | undefined): string => {
  if (!isoDate) return new Date().toISOString().slice(0, 19).replace('T', ' ');
  return new Date(isoDate).toISOString().slice(0, 19).replace('T', ' ');
};

const API_BASE = 'http://192.168.2.48:80'// import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

const apiFetch = async <T>(url: string, options: RequestInit = {}): Promise<T | undefined> => {
  try {
    const response = await fetch(`${API_BASE}${url}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error: ${response.status} - ${errorText || response.statusText}`);
    }
    if (response.status === 204) {
      return undefined;
    }
    try {
      const text = await response.text();
      return text ? JSON.parse(text) as T : undefined;
    } catch {
      return undefined;
    }
    // return response.json() as Promise<T>;
  } catch (error) {
    console.error(`Fetch error for ${url}:`, error);
    throw error;
  }
};

const apiStorage: StorageContext = {
  getConfig: async () => {
    return await apiFetch<ChartDBConfig>('/config');
  },
  updateConfig: async (config: Partial<ChartDBConfig>) => {
    await apiFetch('/config', {
      method: 'PUT',
      body: JSON.stringify({ defaultDiagramId: config.defaultDiagramId }),
    });
  },
  getDiagramFilter: async (diagramId: string) => {
    return await apiFetch<DiagramFilter>(`/diagram-filters/${diagramId}`);
  },
  updateDiagramFilter: async (diagramId: string, filter: DiagramFilter) => {
    await apiFetch(`/diagram-filters/${diagramId}`, {
      method: 'PUT',
      body: JSON.stringify({ tableIds: filter.tableIds, schemasIds: filter.schemaIds }),
    });
  },
  deleteDiagramFilter: async (diagramId: string) => {
    await apiFetch(`/diagram-filters/${diagramId}`, { method: 'DELETE' });
  },
  addDiagram: async ({ diagram }: { diagram: Diagram }) => {
    await apiFetch('/diagrams', {
      method: 'POST',
      body: JSON.stringify({
        diagram: {
          id: diagram.id,
          name: diagram.name,
          databaseType: diagram.databaseType,
          databaseEdition: diagram.databaseEdition || null,
          createdAt: formatDateTime(diagram.createdAt),
          updatedAt: formatDateTime(diagram.updatedAt),
          tables: diagram.tables || [],
          relationships: diagram.relationships || [],
          dependencies: diagram.dependencies || [],
          areas: diagram.areas || [],
          customTypes: diagram.customTypes || [],
        },
      }),
    });
  },
  listDiagrams: async (options) => {
    const params = new URLSearchParams();
    if (options?.includeTables) params.append('includeTables', 'true');
    if (options?.includeRelationships) params.append('includeRelationships', 'true');
    if (options?.includeDependencies) params.append('includeDependencies', 'true');
    if (options?.includeAreas) params.append('includeAreas', 'true');
    if (options?.includeCustomTypes) params.append('includeCustomTypes', 'true');
    return await apiFetch<Diagram[]>(`/diagrams?${params.toString()}`);
  },
  getDiagram: async (id: string, options) => {
    const params = new URLSearchParams();
    if (options?.includeTables) params.append('includeTables', 'true');
    if (options?.includeRelationships) params.append('includeRelationships', 'true');
    if (options?.includeDependencies) params.append('includeDependencies', 'true');
    if (options?.includeAreas) params.append('includeAreas', 'true');
    if (options?.includeCustomTypes) params.append('includeCustomTypes', 'true');
    return await apiFetch<Diagram>(`/diagrams/${id}?${params.toString()}`);
  },
  updateDiagram: async ({ id, attributes }: { id: string; attributes: Partial<Diagram> }) => {
    await apiFetch(`/diagrams/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        attributes: {
          ...attributes,
          createdAt: attributes.createdAt ? formatDateTime(attributes.createdAt) : undefined,
          updatedAt: attributes.updatedAt ? formatDateTime(attributes.updatedAt) : undefined,
        },
      }),
    });
  },
  deleteDiagram: async (id: string) => {
    await apiFetch(`/diagrams/${id}`, { method: 'DELETE' });
  },
  addTable: async ({ diagramId, table }: { diagramId: string; table: DBTable }) => {
    await apiFetch(`/diagrams/${diagramId}/tables`, {
      method: 'POST',
      body: JSON.stringify({
        table: {
          ...table,
          fields: table.fields || [],
          indexes: table.indexes || [],
          createdAt: formatNumberDateTime(table.createdAt),
        },
      }),
    });
  },
  getTable: async ({ diagramId, id }: { diagramId: string; id: string }) => {
    return await apiFetch<DBTable>(`/diagrams/${diagramId}/tables/${id}`);
  },
  updateTable: async ({ id, attributes }: { id: string; attributes: Partial<DBTable> }) => {
    await apiFetch(`/tables/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        attributes: {
          ...attributes,
          createdAt: attributes.createdAt ? formatNumberDateTime(attributes.createdAt) : undefined,
        },
      }),
    });
  },
  putTable: async ({ diagramId, table }: { diagramId: string; table: DBTable }) => {
    await apiFetch(`/diagrams/${diagramId}/tables`, {
      method: 'PUT',
      body: JSON.stringify({
        table: {
          ...table,
          fields: table.fields || [],
          indexes: table.indexes || [],
          createdAt: formatNumberDateTime(table.createdAt),
        },
      }),
    });
  },
  deleteTable: async ({ diagramId, id }: { diagramId: string; id: string }) => {
    await apiFetch(`/diagrams/${diagramId}/tables/${id}`, { method: 'DELETE' });
  },
  listTables: async (diagramId: string) => {
    return await apiFetch<DBTable[]>(`/diagrams/${diagramId}/tables`);
  },
  deleteDiagramTables: async (diagramId: string) => {
    await apiFetch(`/diagrams/${diagramId}/tables`, { method: 'DELETE' });
  },
  addRelationship: async ({ diagramId, relationship }: { diagramId: string; relationship: DBRelationship }) => {
    await apiFetch(`/diagrams/${diagramId}/relationships`, {
      method: 'POST',
      body: JSON.stringify({
        relationship: {
          ...relationship,
          createdAt: formatNumberDateTime(relationship.createdAt),
        },
      }),
    });
  },
  getRelationship: async ({ diagramId, id }: { diagramId: string; id: string }) => {
    return await apiFetch<DBRelationship>(`/diagrams/${diagramId}/relationships/${id}`);
  },
  updateRelationship: async ({ id, attributes }: { id: string; attributes: Partial<DBRelationship> }) => {
    await apiFetch(`/relationships/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        attributes: {
          ...attributes,
          createdAt: attributes.createdAt ? formatNumberDateTime(attributes.createdAt) : undefined,
        },
      }),
    });
  },
  deleteRelationship: async ({ diagramId, id }: { diagramId: string; id: string }) => {
    await apiFetch(`/diagrams/${diagramId}/relationships/${id}`, { method: 'DELETE' });
  },
  listRelationships: async (diagramId: string) => {
    return await apiFetch<DBRelationship[]>(`/diagrams/${diagramId}/relationships`);
  },
  deleteDiagramRelationships: async (diagramId: string) => {
    await apiFetch(`/diagrams/${diagramId}/relationships`, { method: 'DELETE' });
  },
  addDependency: async ({ diagramId, dependency }: { diagramId: string; dependency: DBDependency }) => {
    await apiFetch(`/diagrams/${diagramId}/dependencies`, {
      method: 'POST',
      body: JSON.stringify({
        dependency: {
          ...dependency,
          createdAt: formatNumberDateTime(dependency.createdAt),
        },
      }),
    });
  },
  getDependency: async ({ diagramId, id }: { diagramId: string; id: string }) => {
    return await apiFetch<DBDependency>(`/diagrams/${diagramId}/dependencies/${id}`);
  },
  updateDependency: async ({ id, attributes }: { id: string; attributes: Partial<DBDependency> }) => {
    await apiFetch(`/dependencies/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        attributes: {
          ...attributes,
          createdAt: attributes.createdAt ? formatNumberDateTime(attributes.createdAt) : undefined,
        },
      }),
    });
  },
  deleteDependency: async ({ diagramId, id }: { diagramId: string; id: string }) => {
    await apiFetch(`/diagrams/${diagramId}/dependencies/${id}`, { method: 'DELETE' });
  },
  listDependencies: async (diagramId: string) => {
    return await apiFetch<DBDependency[]>(`/diagrams/${diagramId}/dependencies`);
  },
  deleteDiagramDependencies: async (diagramId: string) => {
    await apiFetch(`/diagrams/${diagramId}/dependencies`, { method: 'DELETE' });
  },
  addArea: async ({ diagramId, area }: { diagramId: string; area: Area }) => {
    await apiFetch(`/diagrams/${diagramId}/areas`, {
      method: 'POST',
      body: JSON.stringify({ area }),
    });
  },
  getArea: async ({ diagramId, id }: { diagramId: string; id: string }) => {
    return await apiFetch<Area>(`/diagrams/${diagramId}/areas/${id}`);
  },
  updateArea: async ({ id, attributes }: { id: string; attributes: Partial<Area> }) => {
    await apiFetch(`/areas/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ attributes }),
    });
  },
  deleteArea: async ({ diagramId, id }: { diagramId: string; id: string }) => {
    await apiFetch(`/diagrams/${diagramId}/areas/${id}`, { method: 'DELETE' });
  },
  listAreas: async (diagramId: string) => {
    return await apiFetch<Area[]>(`/diagrams/${diagramId}/areas`);
  },
  deleteDiagramAreas: async (diagramId: string) => {
    await apiFetch(`/diagrams/${diagramId}/areas`, { method: 'DELETE' });
  },
  addCustomType: async ({ diagramId, customType }: { diagramId: string; customType: DBCustomType }) => {
    await apiFetch(`/diagrams/${diagramId}/custom-types`, {
      method: 'POST',
      body: JSON.stringify({
        customType: {
          ...customType,
          values: customType.values || [],
          fields: customType.fields || [],
        },
      }),
    });
  },
  getCustomType: async ({ diagramId, id }: { diagramId: string; id: string }) => {
    return await apiFetch<DBCustomType>(`/diagrams/${diagramId}/custom-types/${id}`);
  },
  updateCustomType: async ({ id, attributes }: { id: string; attributes: Partial<DBCustomType> }) => {
    await apiFetch(`/custom-types/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ attributes }),
    });
  },
  deleteCustomType: async ({ diagramId, id }: { diagramId: string; id: string }) => {
    await apiFetch(`/diagrams/${diagramId}/custom-types/${id}`, { method: 'DELETE' });
  },
  listCustomTypes: async (diagramId: string) => {
    return await apiFetch<DBCustomType[]>(`/diagrams/${diagramId}/custom-types`);
  },
  deleteDiagramCustomTypes: async (diagramId: string) => {
    await apiFetch(`/diagrams/${diagramId}/custom-types`, { method: 'DELETE' });
  },
};

export default apiStorage;