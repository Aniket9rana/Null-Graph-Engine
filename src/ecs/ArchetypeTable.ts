import type { ComponentId, EntityId, TypedArray } from './types';

/**
 * An ArchetypeTable stores the component data for all entities that have the exact same
 * set of components. Data is stored in a Structure of Arrays (SoA) layout, which is
 * highly efficient for iteration.
 */
export class ArchetypeTable {
    // A bitmask representing the unique set of components for this archetype.
    readonly mask: ComponentId;
    
    // SoA column storage. A map from a ComponentId to a TypedArray for all entities.
    readonly columns: Map<ComponentId, TypedArray>;
    
    // A dense array of entity IDs that belong to this archetype.
    readonly entityIds: Uint32Array;
    
    // A map from an entity ID to its row index in the dense arrays.
    readonly entityToIndex: Map<EntityId, number>;

    // The number of active entities in this table.
    count: number = 0;
    private capacity: number;

    /**
     * @param mask The archetype's component bitmask.
     * @param componentConstructors A map from ComponentId to a constructor for the TypedArray.
     * @param initialCapacity The initial storage capacity of the table.
     */
    constructor(mask: ComponentId, componentConstructors: Map<ComponentId, { new(length: number): TypedArray }>, initialCapacity: number = 128) {
        this.mask = mask;
        this.capacity = initialCapacity;
        this.columns = new Map();
        this.entityToIndex = new Map();
        
        for (const [id, constructor] of componentConstructors.entries()) {
            // This assumes a stride of 1 for all components, which is a simplification for now.
            // A full implementation would handle multi-element components (e.g., vec3).
            this.columns.set(id, new constructor(this.capacity));
        }
        
        this.entityIds = new Uint32Array(this.capacity);
    }
    
    /**
     * Adds an entity's ID to the table. Data must be written separately.
     * Assumes the table has capacity.
     * @param id The entity ID to add.
     * @returns The new index of the entity in the table.
     */
    addEntity(id: EntityId): number {
        const index = this.count;
        this.entityIds[index] = id;
        this.entityToIndex.set(id, index);
        this.count++;
        return index;
    }

    /**
     * Removes an entity from the table by its row index using swap-remove.
     * This is an O(1) operation that preserves data density.
     * @param index The index of the entity to remove.
     * @returns The entity ID that was at the end and has been moved into the removed spot.
     */
    removeEntity(index: number): EntityId | null {
        const lastIndex = this.count - 1;
        if (index > lastIndex || index < 0) {
            throw new Error(`Index ${index} is out of bounds.`);
        }
        
        const removedEntityId = this.entityIds[index];
        this.entityToIndex.delete(removedEntityId);

        let movedEntityId: EntityId | null = null;

        if (index !== lastIndex) {
            // Move the last element into the removed element's spot.
            movedEntityId = this.entityIds[lastIndex];
            this.entityIds[index] = movedEntityId;
            this.entityToIndex.set(movedEntityId, index);

            // Copy component data from the last element to the new spot.
            for (const column of this.columns.values()) {
                // This is a simplified copy for components with stride=1.
                const lastElement = column.subarray(lastIndex, lastIndex + 1);
                column.set(lastElement, index);
            }
        }
        
        this.count--;
        return movedEntityId;
    }

    public getColumn(id: ComponentId): TypedArray | undefined {
        return this.columns.get(id);
    }
    
    // TODO: Add a resize method to grow the table's capacity when needed.
}
