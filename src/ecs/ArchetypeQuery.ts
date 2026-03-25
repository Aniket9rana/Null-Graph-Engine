import type { ArchetypeTable } from './ArchetypeTable';
import type { ComponentId, TypedArray } from './types';

/**
 * An ArchetypeQuery provides an efficient way to iterate over entities that
 * have a specific set of components.
 */
export class ArchetypeQuery {
    // The list of archetype tables that match the query's component mask.
    private tables: ArchetypeTable[];
    // The component IDs that this query operates on, in a specific order.
    private componentIds: ComponentId[];

    constructor(tables: ArchetypeTable[], componentIds: ComponentId[]) {
        this.tables = tables;
        this.componentIds = componentIds;
    }

    /**
     * Iterates over each archetype table that matches the query.
     * The callback is executed for each table, receiving the number of active entities
     * in that table and the requested component columns (as TypedArrays).
     * This "chunked" iteration is extremely fast as it allows the user to write
     * tight, branchless loops over contiguous memory in the hot path.
     *
     * @example
     * const query = world.query(Position, Velocity);
     * query.forEach((count, positions, velocities) => {
     *   for (let i = 0; i < count; i++) {
     *     // Accessing vec3 data stored as AoS in a Float32Array
     *     const stride = 3;
     *     positions[i * stride] += velocities[i * stride] * dt;
     *     positions[i * stride + 1] += velocities[i * stride + 1] * dt;
     *     positions[i * stride + 2] += velocities[i * stride + 2] * dt;
     *   }
     * });
     */
    public forEach(callback: (count: number, ...columns: TypedArray[]) => void): void {
        for (const table of this.tables) {
            if (table.count === 0) {
                continue;
            }
            const columns = this.componentIds.map(id => table.getColumn(id)!);
            callback(table.count, ...columns);
        }
    }

    /**
     * Provides an iterator over the archetype tables for use in for...of loops.
     */
    public *[Symbol.iterator](): Generator<ArchetypeTable> {
        for (const table of this.tables) {
            if (table.count > 0) {
                yield table;
            }
        }
    }

    /**
     * Returns the single entity that matches the query, if one exists.
     * Throws an error if more than one entity matches.
     * @returns The entity ID, or null if no entity matches.
     */
    public getSingleEntity(): number | null {
        // This is a convenience method and is not meant for the hot path.
        let entity: number | null = null;
        let found = 0;
        for (const table of this.tables) {
            if (table.count > 0) {
                if (found > 0 || table.count > 1) {
                    throw new Error("Query matches more than one entity.");
                }
                entity = table.entityIds[0];
                found = 1;
            }
        }
        return entity;
    }
}
