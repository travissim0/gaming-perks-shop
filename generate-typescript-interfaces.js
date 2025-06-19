// Generate TypeScript Interfaces from Database Schema
// Run this after executing get-complete-schema.sql
// Usage: node generate-typescript-interfaces.js

const fs = require('fs');

// PostgreSQL to TypeScript type mapping
const typeMapping = {
  'uuid': 'string',
  'text': 'string',
  'varchar': 'string',
  'character varying': 'string',
  'boolean': 'boolean',
  'integer': 'number',
  'bigint': 'number',
  'numeric': 'number',
  'real': 'number',
  'double precision': 'number',
  'timestamp with time zone': 'string',
  'timestamptz': 'string',
  'timestamp without time zone': 'string',
  'date': 'string',
  'time': 'string',
  'jsonb': 'any',
  'json': 'any',
  'text[]': 'string[]',
  'integer[]': 'number[]',
  'uuid[]': 'string[]'
};

// Function to convert PostgreSQL type to TypeScript
function pgTypeToTS(pgType, isNullable = false) {
  let tsType = typeMapping[pgType.toLowerCase()] || 'any';
  
  // Handle arrays
  if (pgType.endsWith('[]') && !typeMapping[pgType.toLowerCase()]) {
    const baseType = pgType.slice(0, -2);
    tsType = `${pgTypeToTS(baseType)}[]`;
  }
  
  // Handle nullable types
  if (isNullable === 'YES') {
    tsType += ' | null';
  }
  
  return tsType;
}

// Generate interface from table schema
function generateTableInterface(tableName, columns) {
  let interfaceStr = `export interface ${toPascalCase(tableName)} {\n`;
  
  columns.forEach(col => {
    const tsType = pgTypeToTS(col.data_type, col.is_nullable);
    const optional = col.is_nullable === 'YES' ? '?' : '';
    interfaceStr += `  ${col.column_name}${optional}: ${tsType};\n`;
  });
  
  interfaceStr += '}\n\n';
  return interfaceStr;
}

// Generate RPC function type
function generateRPCType(funcName, returnType, parameters) {
  const paramStr = parameters || '';
  let tsReturnType = 'any';
  
  // Parse return type
  if (returnType.includes('SETOF')) {
    tsReturnType = 'any[]';
  } else if (returnType.includes('TABLE')) {
    tsReturnType = 'any[]';
  } else {
    tsReturnType = pgTypeToTS(returnType.replace('SETOF ', ''));
  }
  
  return `export type ${toPascalCase(funcName)}Result = ${tsReturnType};\n`;
}

// Convert snake_case to PascalCase
function toPascalCase(str) {
  return str.split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

// Generate enum type
function generateEnumType(enumName, values) {
  const enumValues = values.split(', ').map(v => `'${v}'`).join(' | ');
  return `export type ${toPascalCase(enumName)} = ${enumValues};\n\n`;
}

console.log(`
// Auto-generated TypeScript interfaces from database schema
// Generated on: ${new Date().toISOString()}
// 
// To use this script:
// 1. Run get-complete-schema.sql in your Supabase SQL Editor
// 2. Copy the results and create JSON files with the data
// 3. Update the file paths below to point to your JSON files
// 4. Run: node generate-typescript-interfaces.js

// Example usage after getting schema data:
/*
const tableData = require('./table-schema.json');
const enumData = require('./enum-schema.json');
const functionData = require('./function-schema.json');

let output = '// Database Types\\n\\n';

// Generate table interfaces
tableData.forEach(table => {
  output += generateTableInterface(table.table_name, table.columns);
});

// Generate enum types
enumData.forEach(enumType => {
  if (enumType.type_type === 'e') {
    output += generateEnumType(enumType.type_name, enumType.enum_values);
  }
});

// Generate RPC function types
functionData.forEach(func => {
  output += generateRPCType(func.function_name, func.return_type, func.parameters);
});

fs.writeFileSync('./src/types/database.ts', output);
console.log('Generated database types in ./src/types/database.ts');
*/

// For immediate use, here are the critical types based on your current error:

export interface SquadInvitation {
  id: string;
  squad_id: string;
  player_id: string;
  invited_by: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
  squad?: {
    id: string;
    name: string;
    tag: string;
    captain_id: string;
  };
  invited_by_profile?: {
    id: string;
    in_game_alias: string;
  };
}

export interface FreeAgent {
  id: string;
  player_id: string;
  preferred_roles: string[];
  availability?: string | null;
  skill_level: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  notes?: string | null;
  contact_info?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  profile?: {
    id: string;
    in_game_alias: string;
    email: string;
  };
}

export interface SquadMember {
  id: string;
  squad_id: string;
  player_id: string;
  role: 'captain' | 'co_captain' | 'player';
  status: string;
  joined_at: string;
  profile?: {
    id: string;
    in_game_alias: string;
    email: string;
  };
}

// RPC Function return types (these are what was causing your error)
export type GetSquadInvitationsOptimizedResult = SquadInvitation[];
export type GetFreeAgentsOptimizedResult = FreeAgent[];
export type GetSquadMembersOptimizedResult = SquadMember[];

console.log('TypeScript interface generator ready!');
console.log('Run get-complete-schema.sql first, then use the generated data with this script.');
`);

// Helper functions for the generator
module.exports = {
  generateTableInterface,
  generateRPCType,
  generateEnumType,
  pgTypeToTS,
  toPascalCase
}; 