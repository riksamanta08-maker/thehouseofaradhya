const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const PRODUCT_ID = 'cmll6ziti00n52chy5cpaq859';

const buildVariantTitle = (variant, optionOrder) => {
    if (variant.title) return variant.title;
    if (!variant.optionValues || !optionOrder?.length) return 'Default';
    const parts = optionOrder
        .map((opt) => variant.optionValues[opt.name])
        .filter((value) => value && String(value).trim() !== '');
    return parts.length ? parts.join(' / ') : 'Default';
};

const resolveCollectionIds = async (tx, payload) => {
    const ids = Array.isArray(payload.collections) ? payload.collections : [];
    const handles = Array.isArray(payload.collectionHandles) ? payload.collectionHandles : [];
    if (!handles.length) return ids;
    const found = await tx.collection.findMany({
        where: { handle: { in: handles } },
        select: { id: true },
    });
    return Array.from(new Set([...ids, ...found.map((item) => item.id)]));
};

const toDecimalString = (value) =>
    value !== undefined && value !== null ? value.toString() : null;

// Mock payload based on potentially problematic update
// Use data from product_response.json but formatted as input payload
const mockPayload = {
    title: "Aradhya Amantran (combo)",
    handle: "aradhya-amantran-combo",
    status: "ACTIVE",
    tags: ["Date wear"],
    // Re-sending existing media
    media: [
        {
            url: "https://res.cloudinary.com/dndotl4sl/image/upload/v1771563207/marvelle/luffy.jpg",
            type: "IMAGE",
            position: 0
        }
    ],
    // Re-sending existing options
    options: [
        {
            name: "Title",
            values: ["Default Title"]
        }
    ],
    // Re-sending existing variants
    variants: [
        {
            title: "Default Title",
            price: "2500",
            taxable: true,
            trackInventory: true,
            inventoryPolicy: "DENY",
            requiresShipping: true,
            optionValues: { "Title": "Default Title" },
            inventory: { available: 0, location: "Default" }
        }
    ],
    collections: [], // Empty collections
    metafields: []
};

const createProductRelations = async (tx, productId, payload) => {
    const collectionIds = await resolveCollectionIds(tx, payload);
    if (collectionIds.length) {
        console.log('Creating collections...');
        await tx.productCollection.createMany({
            data: collectionIds.map((collectionId, index) => ({
                productId,
                collectionId,
                position: index + 1,
            })),
        });
    }

    if (payload.media?.length) {
        console.log('Creating media...');
        await tx.productMedia.createMany({
            data: payload.media.map((media, index) => ({
                productId,
                url: media.url,
                alt: media.alt ?? null,
                type: media.type ?? 'IMAGE',
                position: media.position ?? index,
            })),
        });
    }

    if (payload.options?.length) {
        console.log('Creating options...');
        await tx.productOption.createMany({
            data: payload.options.map((option, index) => ({
                productId,
                name: option.name,
                values: option.values,
                position: index + 1,
            })),
        });
    }

    const mediaRecords = payload.media?.length
        ? await tx.productMedia.findMany({ where: { productId } })
        : [];
    const mediaByUrl = new Map(mediaRecords.map((record) => [record.url, record.id]));

    const optionOrder = payload.options || [];

    if (payload.variants?.length) {
        console.log('Creating variants...');
        for (const [index, variant] of payload.variants.entries()) {
            const created = await tx.productVariant.create({
                data: {
                    productId,
                    title: buildVariantTitle(variant, optionOrder),
                    position: index + 1,
                    sku: variant.sku ?? null,
                    barcode: variant.barcode ?? null,
                    price: toDecimalString(variant.price),
                    compareAtPrice: toDecimalString(variant.compareAtPrice),
                    costPerItem: toDecimalString(variant.costPerItem),
                    unitPrice: toDecimalString(variant.unitPrice),
                    unitPriceMeasurement: variant.unitPriceMeasurement,
                    taxable: variant.taxable ?? true,
                    trackInventory: variant.trackInventory ?? true,
                    inventoryPolicy: variant.inventoryPolicy ?? 'DENY',
                    requiresShipping: variant.requiresShipping ?? true,
                    weight: toDecimalString(variant.weight),
                    weightUnit: variant.weightUnit ?? null,
                    originCountryCode: variant.originCountryCode ?? null,
                    hsCode: variant.hsCode ?? null,
                    optionValues: variant.optionValues ?? undefined,
                    imageId: variant.imageUrl ? mediaByUrl.get(variant.imageUrl) : null,
                },
            });

            // Inventory
            // skipping inventory logic details for brevity if not relevant, but let's keep it simple
            if (variant.inventory?.available !== undefined && variant.trackInventory !== false) {
                // Assume location exists for simplicity or use default logic
                // For strict reproduction we should use the same logic
            }
        }
    }
};

async function main() {
    try {
        console.log('Starting transaction...');
        await prisma.$transaction(async (tx) => {
            // 1. Update product
            console.log('Updating product base...');
            const updated = await tx.product.update({
                where: { id: PRODUCT_ID },
                data: {
                    title: mockPayload.title,
                    handle: mockPayload.handle,
                    status: mockPayload.status,
                    tags: mockPayload.tags
                }
            });

            // 2. Delete related
            console.log('Deleting relations...');
            await tx.productCollection.deleteMany({ where: { productId: updated.id } });
            await tx.productMedia.deleteMany({ where: { productId: updated.id } });
            await tx.productOption.deleteMany({ where: { productId: updated.id } });
            // Delete variants and inventory
            await tx.inventoryLevel.deleteMany({ where: { variant: { productId: updated.id } } });
            await tx.productVariant.deleteMany({ where: { productId: updated.id } });
            await tx.productMetafield.deleteMany({ where: { productId: updated.id } });

            // 3. Recreate
            console.log('Recreating relations...');
            await createProductRelations(tx, updated.id, mockPayload);

            console.log('Transaction successful!');
        });
    } catch (error) {
        console.error('FATAL ERROR:', error);
        // Log meta if Prisma error
        if (error.meta) console.error('Error Meta:', error.meta);
    } finally {
        await prisma.$disconnect();
    }
}

main();
