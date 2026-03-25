export type ComponentId = bigint;
export type EntityId = number;

// A map from a component's ID to its data for a single entity.
// The 'any' here would typically be a structured object for a component's data.
export type ComponentData = Map<ComponentId, any>;

export type TypedArray =
  | Int8Array
  | Uint8Array
  | Uint8ClampedArray
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float32Array
  | Float64Array;

