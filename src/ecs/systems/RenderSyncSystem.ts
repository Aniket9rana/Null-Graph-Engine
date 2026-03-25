import type { World } from '../World';
import { Position, Scale, Color, Rotation, BatchRef } from '../components';
import { RenderBatch } from '../../renderer/RenderBatch';

/**
 * The RenderSyncSystem is the bridge between the ECS and the GPU rendering data.
 * It queries for all renderable entities and efficiently packs their component
 * data into interleaved arrays (scratch buffers) for each render batch.
 * This system is on the hot path and is designed to be allocation-free during its run.
 */
export class RenderSyncSystem {
    // pos (3), rot (4), scale (3), color (4) = 14 floats
    public static readonly INSTANCE_STRIDE = 14; 

    /**
     * Runs the system for one frame.
     * @param world The ECS World.
     * @param batches A map from a batch ID to a RenderBatch object.
     */
    public run(world: World, batches: Map<number, RenderBatch>): void {
        // 1. Reset instance counts for all batches.
        for (const batch of batches.values()) {
            batch.instanceCount = 0;
        }

        // 2. Query for all components required for rendering.
        const query = world.query(Position, Rotation, Scale, Color, BatchRef);
        
        // 3. For each matching archetype table...
        query.forEach((count, positions, rotations, scales, colors, batchRefs) => {
            // ...iterate through its entities.
            for (let i = 0; i < count; i++) {
                const batchId = (batchRefs as Uint32Array)[i];
                const batch = batches.get(batchId);
                if (!batch) continue;

                const instanceIndex = batch.instanceCount;
                const offset = instanceIndex * RenderSyncSystem.INSTANCE_STRIDE;

                // This assumes that Position, Rotation, etc. are component *definitions*
                // that provide stride information. For now, we hardcode strides based on the
                // component schema that would be registered with the World.
                const posStride = 3;
                const rotStride = 4;
                const scaleStride = 3;
                const colorStride = 4;

                // Write interleaved data to the batch's scratch buffer.
                batch.scratchBuffer.set((positions as Float32Array).subarray(i * posStride, i * posStride + posStride), offset);
                batch.scratchBuffer.set((rotations as Float32Array).subarray(i * rotStride, i * rotStride + rotStride), offset + 3);
                batch.scratchBuffer.set((scales as Float32Array).subarray(i * scaleStride, i * scaleStride + scaleStride), offset + 7);
                batch.scratchBuffer.set((colors as Float32Array).subarray(i * colorStride, i * colorStride + colorStride), offset + 10);
                
                batch.instanceCount++;
            }
        });

        // 4. After collecting all instance data, upload it to the GPU for each batch.
        for (const batch of batches.values()) {
            if (batch.instanceCount > 0) {
                // Upload only the portion of the scratch buffer that was filled.
                batch.updateInstances(batch.scratchBuffer.subarray(0, batch.instanceCount * RenderSyncSystem.INSTANCE_STRIDE));
            }
        }
    }
}
