import cron from 'node-cron';
import { InventoryBatch } from '../models/InventoryBatch.js';
import { ExpiryAction } from '../models/ExpiryAction.js';
import { getDaysToExpiry, getRiskBucket, getSuggestedAction } from '../services/inventoryBatches.js';

async function runExpiryRecomputeJob() {
    const batches = await InventoryBatch.find({
        status: { $in: ['active', 'expired'] },
        quantityAvailable: { $gt: 0 },
    }).select('_id shopkeeperId productId expiryDate quantityAvailable status');

    let upserts = 0;
    for (const batch of batches) {
        const daysToExpiry = getDaysToExpiry(batch.expiryDate);
        if (daysToExpiry === null) continue;

        if (daysToExpiry < 0 && batch.status !== 'expired') {
            batch.status = 'expired';
            await batch.save();
        }

        const riskBucket = getRiskBucket(daysToExpiry);
        if (!riskBucket) continue;

        await ExpiryAction.findOneAndUpdate(
            {
                shopkeeperId: batch.shopkeeperId,
                batchId: batch._id,
                actionStatus: { $in: ['open', 'in_progress'] },
            },
            {
                shopkeeperId: batch.shopkeeperId,
                productId: batch.productId,
                batchId: batch._id,
                daysToExpiry,
                riskBucket,
                suggestedAction: getSuggestedAction(daysToExpiry, batch.quantityAvailable),
                lastEvaluatedAt: new Date(),
            },
            {
                upsert: true,
                setDefaultsOnInsert: true,
            }
        );
        upserts += 1;
    }

    return { scanned: batches.length, upserts };
}

export function startExpiryScheduler() {
    cron.schedule('15 8 * * *', async () => {
        try {
            const result = await runExpiryRecomputeJob();
            console.log(`[ExpiryScheduler] scanned=${result.scanned} upserts=${result.upserts}`);
        } catch (error) {
            console.error('[ExpiryScheduler] failed', error);
        }
    });

    runExpiryRecomputeJob()
        .then((result) => console.log(`[ExpiryScheduler] initial scanned=${result.scanned} upserts=${result.upserts}`))
        .catch((error) => console.error('[ExpiryScheduler] initial run failed', error));
}
