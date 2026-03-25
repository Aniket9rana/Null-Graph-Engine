import { ArchetypeQuery } from './ArchetypeQuery';
import { ArchetypeTable } from './ArchetypeTable';
import type { ComponentId, EntityId, ComponentData, TypedArray } from './types';

// A map from ComponentId to its TypedArray constructor.
// A full implementation would also include stride information.
type ComponentRegistry = Map<ComponentId, { new(length: number): TypedArray }>;

/**
 * The World is the main entry point for all ECS (Entity-Component-System) operations.
 * It manages entities, components, and their storage in archetype tables.
 */
export class World {
    // A map from an archetype mask to its table.
    private archetypes: Map<ComponentId, ArchetypeTable> = new Map();
    // A map from an entity ID to the archetype table it belongs to.
    private entityArchetype: Map<EntityId, ArchetypeTable> = new Map();
    
    private nextEntityId: EntityId = 0;
    
    private componentRegistry: ComponentRegistry = new Map();

    /**
     * Registers a new component type with the world.
     * All component types must be registered before they can be used.
     * @param id The unique bitmask for the component type.
     * @param constructor The TypedArray constructor used to store this component.
     */
    public registerComponent(id: ComponentId, constructor: { new(length: number): TypedArray }): void {
        this.componentRegistry.set(id, constructor);
    }

    /**
     * Creates a new entity with the given set of components.
     * @param components A map of ComponentId to the data for each component.
     * @returns The ID of the newly created entity.
     */
    public createEntity(components: ComponentData = new Map()): EntityId {
        const id = this.nextEntityId++;
        const mask = this.calculateMask(components);
        
        let archetype = this.findOrCreateArchetype(mask);
        
        this.entityArchetype.set(id, archetype);
        archetype.addEntity(id);
        
        // TODO: Write component data to the archetype table at the new index.
        // This requires a schema for each component to know how to write to the TypedArray.
        
        return id;
    }

    /**
     * Destroys an entity and removes all its component data.
     * @param id The ID of the entity to destroy.
     */
    public destroyEntity(id: EntityId): void {
        const archetype = this.entityArchetype.get(id);
        if (archetype) {
            const index = archetype.entityToIndex.get(id)!;
            const movedEntityId = archetype.removeEntity(index);
            // If an entity was moved, we need to update its archetype mapping in the world.
            if (movedEntityId !== null) {
                this.entityArchetype.set(movedEntityId, archetype);
            }
            this.entityArchetype.delete(id);
        }
    }
    
    private calculateMask(components: ComponentData): ComponentId {
        let mask = 0n;
        for (const id of components.keys()) {
            mask |= id;
        }
        return mask;
    }

    private findOrCreateArchetype(mask: ComponentId): ArchetypeTable {
        let archetype = this.archetypes.get(mask);
        if (!archetype) {
            const constructors = new Map();
            for (const [id, constructor] of this.componentRegistry.entries()) {
                if ((mask & id) === id) {
                    constructors.set(id, constructor);
                }
            }
            archetype = new ArchetypeTable(mask, constructors);
            this.archetypes.set(mask, archetype);
        }
        return archetype;
    }

    // TODO: addComponent(id, component) -> moves entity to a new archetype
    // TODO: removeComponent(id, componentType) -> moves entity to a new archetype
    
    private queryCache: Map<string, ArchetypeQuery> = new Map();

    /**
     * Creates or retrieves a cached query for a set of components.
     * @param componentIds The component IDs to query for.
     * @returns An ArchetypeQuery instance.
     */
    public query(...componentIds: ComponentId[]): ArchetypeQuery {
        // Sorting IDs creates a stable key for caching, regardless of user input order.
        const queryKey = componentIds.sort().join('|');
        if (this.queryCache.has(queryKey)) {
            return this.queryCache.get(queryKey)!;
        }

        let queryMask = 0n;
        for (const id of componentIds) {
            queryMask |= id;
        }

        const matchingTables: ArchetypeTable[] = [];
        for (const table of this.archetypes.values()) {
            if ((table.mask & queryMask) === queryMask) {
                matchingTables.push(table);
            }
        }

        const query = new ArchetypeQuery(matchingTables, componentIds);
        this.queryCache.set(queryKey, query);
        return query;
    }
}
