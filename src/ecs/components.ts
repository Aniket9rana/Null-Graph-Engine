import type { ComponentId } from './types';

// Built-in component type IDs. Each is a unique bit in a bigint bitmask.
export const Position: ComponentId = 1n << 0n;
export const Velocity: ComponentId = 1n << 1n;
export const Rotation: ComponentId = 1n << 2n;
export const Scale: ComponentId = 1n << 3n;
export const AABB: ComponentId = 1n << 4n;
export const Color: ComponentId = 1n << 5n;
export const Material: ComponentId = 1n << 6n;
export const BatchRef: ComponentId = 1n << 7n;
export const Bone: ComponentId = 1n << 8n;
export const LODState: ComponentId = 1n << 9n;
export const LifeTime: ComponentId = 1n << 10n;
export const CullFlag: ComponentId = 1n << 11n;

// In a full implementation, you would also define the schema for each component,
// including its properties and their types (e.g., Position has x, y, z as f32).
// For now, we will handle schema registration directly in the World.
