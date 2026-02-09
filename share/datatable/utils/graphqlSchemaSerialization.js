import {
  getNamedType,
  isEnumType,
  isInputObjectType,
  isInterfaceType,
  isListType,
  isNonNullType,
  isObjectType,
  isScalarType,
  isUnionType,
} from 'graphql';

export function getNamedTypeKind(type) {
  if (!type) return null;
  if (isObjectType(type)) return 'OBJECT';
  if (isInterfaceType(type)) return 'INTERFACE';
  if (isUnionType(type)) return 'UNION';
  if (isEnumType(type)) return 'ENUM';
  if (isInputObjectType(type)) return 'INPUT_OBJECT';
  if (isScalarType(type)) return 'SCALAR';
  return null;
}

export function getTypeName(type) {
  const namedType = getNamedType(type);
  return namedType?.name ?? null;
}

export function createGraphQLSerializationContext(schema) {
  return {
    schema,
    serializedTypes: new Map(),
    inProgress: new Set(),
  };
}

export function serializeGraphQLArgument(arg, context) {
  if (!arg) return null;
  return {
    name: arg.name,
    description: arg.description ?? null,
    defaultValue: arg.defaultValue ?? null,
    type: serializeGraphQLTypeRef(arg.type, context),
  };
}

export function serializeGraphQLTypeRef(type, context) {
  if (!type) return null;
  if (isNonNullType(type)) {
    return {
      kind: 'NON_NULL',
      ofType: serializeGraphQLTypeRef(type.ofType, context),
    };
  }
  if (isListType(type)) {
    return {
      kind: 'LIST',
      ofType: serializeGraphQLTypeRef(type.ofType, context),
    };
  }
  const namedType = getNamedType(type);
  const typeName = getTypeName(type);
  const kind = getNamedTypeKind(namedType);
  if (namedType && typeName) ensureGraphQLTypeSerialized(namedType, context);
  return { kind, name: typeName };
}

export function ensureGraphQLTypeSerialized(namedType, context) {
  if (!namedType) return;
  const typeName = namedType.name;
  if (!typeName) return;
  if (context.serializedTypes.has(typeName) || context.inProgress.has(typeName)) return;

  context.inProgress.add(typeName);
  const kind = getNamedTypeKind(namedType);
  const typeDef = {
    kind,
    name: typeName,
    description: namedType?.description ?? null,
  };
  context.serializedTypes.set(typeName, typeDef);

  try {
    if (isObjectType(namedType) || isInterfaceType(namedType)) {
      const fields = Object.values(namedType.getFields?.() ?? {});
      typeDef.fields = fields.map((field) => ({
        name: field.name,
        description: field.description ?? null,
        args: Array.isArray(field.args) ? field.args.map((arg) => serializeGraphQLArgument(arg, context)) : [],
        type: serializeGraphQLTypeRef(field.type, context),
      }));
      if (typeof namedType.getInterfaces === 'function') {
        const interfaces = namedType.getInterfaces();
        typeDef.interfaces = interfaces.map((iface) => iface.name);
        interfaces.forEach((iface) => ensureGraphQLTypeSerialized(iface, context));
      }
      if (isInterfaceType(namedType) && context.schema?.getPossibleTypes) {
        try {
          const possible = context.schema.getPossibleTypes(namedType) || [];
          if (possible.length > 0) {
            typeDef.possibleTypes = possible.map((possibleType) => possibleType.name);
            possible.forEach((possibleType) => ensureGraphQLTypeSerialized(possibleType, context));
          }
        } catch (error) {
          console.warn('graphqlSchemaSerialization: Failed to resolve possible types for', typeName, error);
        }
      }
    } else if (isUnionType(namedType)) {
      const unionTypes = typeof namedType.getTypes === 'function' ? namedType.getTypes() : [];
      typeDef.types = unionTypes.map((unionType) => unionType.name);
      unionTypes.forEach((unionType) => ensureGraphQLTypeSerialized(unionType, context));
    } else if (isEnumType(namedType)) {
      typeDef.values = typeof namedType.getValues === 'function'
        ? namedType.getValues().map((enumValue) => ({
            name: enumValue.name,
            description: enumValue.description ?? null,
            deprecationReason: enumValue.deprecationReason ?? null,
          }))
        : [];
    } else if (isInputObjectType(namedType)) {
      const inputFields = Object.values(namedType.getFields?.() ?? {});
      typeDef.inputFields = inputFields.map((inputField) => ({
        name: inputField.name,
        description: inputField.description ?? null,
        defaultValue: inputField.defaultValue ?? null,
        type: serializeGraphQLTypeRef(inputField.type, context),
      }));
    }
  } finally {
    context.inProgress.delete(typeName);
  }
}

export function serializeGraphQLField(field, schema) {
  if (!field) return null;
  const context = createGraphQLSerializationContext(schema);
  const fieldInfo = {
    name: field.name,
    description: field.description ?? null,
    args: Array.isArray(field.args) ? field.args.map((arg) => serializeGraphQLArgument(arg, context)) : [],
    type: serializeGraphQLTypeRef(field.type, context),
  };
  const types = Object.fromEntries(context.serializedTypes);
  return { field: fieldInfo, types };
}
