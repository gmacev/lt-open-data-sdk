/**
 * Type mapper for converting Spinta types to TypeScript types
 *
 * Based on duomenu-tipai.rst.txt documentation
 */

/**
 * Map a Spinta type to its TypeScript equivalent
 *
 * @param spintaType - The type string from Spinta model metadata
 * @returns TypeScript type as a string
 */
export function mapSpintaType(spintaType: string): string {
  // Handle parameterized types like geometry(point, 4326)
  const baseType = spintaType.split('(')[0]?.trim().toLowerCase() ?? '';

  switch (baseType) {
    // Numeric types
    case 'integer':
    case 'number':
      return 'number';

    // Text types
    case 'string':
    case 'text':
      return 'string';

    // Boolean
    case 'boolean':
      return 'boolean';

    // Temporal types - return string since ISO 8601 format
    case 'date':
    case 'datetime':
    case 'time':
    case 'temporal':
      return 'string';

    // Geometry - WKT string format
    case 'geometry':
    case 'spatial':
      return 'string';

    // Reference - can be string ID or object depending on query
    // Using union as per user feedback - runtime behavior varies
    case 'ref':
      return 'string | { _id: string }';

    // Back reference (array of refs)
    case 'backref':
      return 'Array<string | { _id: string }>';

    // Generic reference (polymorphic)
    case 'generic':
      return '{ object_model: string; object_id: string }';

    // File types
    case 'file':
    case 'image':
      return '{ _id: string; name: string; type: string; size?: number }';

    // Binary data (base64 encoded)
    case 'binary':
      return 'string';

    // URL/URI types
    case 'url':
    case 'uri':
      return 'string';

    // Money
    case 'money':
      return 'string | number';

    // Composite types
    case 'object':
      return 'Record<string, unknown>';

    case 'array':
      return 'unknown[]';

    // Required modifier - strip it
    case 'required':
      return 'unknown';

    // Absent (deleted property)
    case 'absent':
      return 'never';

    // Empty type
    case '':
      return 'unknown';

    // Unknown type - fallback
    default:
      // Check if it's a required variant
      if (spintaType.includes('required')) {
        const cleanType = spintaType.replace(/\s*required\s*/i, '').trim();
        return mapSpintaType(cleanType);
      }
      return 'unknown';
  }
}

/**
 * Check if a Spinta type is required
 */
export function isRequired(spintaType: string): boolean {
  return spintaType.toLowerCase().includes('required');
}

/**
 * Convert a model path to a TypeScript interface name
 * Adds namespace prefix to avoid collisions
 *
 * @example
 * 'datasets/gov/ivpk/adk/Dataset' → 'GovIvpkAdk_Dataset'
 */
export function modelPathToInterfaceName(modelPath: string): string {
  const parts = modelPath.split('/');
  const modelName = parts[parts.length - 1] ?? modelPath;

  // Skip 'datasets' prefix if present
  const namespaceParts = parts.slice(0, -1).filter((p) => p !== 'datasets');

  if (namespaceParts.length === 0) {
    return modelName;
  }

  // Capitalize first letter of each namespace part
  const prefix = namespaceParts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');

  return `${prefix}_${modelName}`;
}

/**
 * Convert a property name to a safe TypeScript property name
 * Handles special characters like @lt for language codes
 */
export function sanitizePropertyName(name: string): string {
  // Handle language suffix @lt, @en, etc.
  if (name.includes('@')) {
    const parts = name.split('@');
    const baseName = parts[0] ?? '';
    const lang = parts[1] ?? '';
    return `${baseName}_${lang}`;
  }

  // Replace any invalid characters
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
}

/**
 * Generate JSDoc comment from title and description
 */
export function generateJsDoc(title?: string, description?: string): string {
  if (title === undefined && description === undefined) {
    return '';
  }

  const lines: string[] = ['/**'];

  if (title !== undefined) {
    lines.push(` * ${title}`);
  }

  if (description !== undefined) {
    if (title !== undefined) {
      lines.push(' *');
    }
    // Handle multi-line descriptions
    for (const line of description.split('\n')) {
      lines.push(` * ${line.trim()}`);
    }
  }

  lines.push(' */');

  return lines.join('\n');
}
