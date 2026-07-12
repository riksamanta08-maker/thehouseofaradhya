const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function createBundleProduct() {
    try {
        // Get existing products to use in the bundle
        const products = await prisma.product.findMany({
            take: 3,
            select: { handle: true, title: true }
        });

        if (products.length < 3) {
            console.log('⚠ Not enough products in database. Need at least 3 products.');
            return;
        }

        console.log('Creating bundle product with items:');
        products.forEach(p => console.log(`  - ${p.title} (${p.handle})`));

        // Get default location
        const location = await prisma.inventoryLocation.findFirst();

        // Create the bundle product
        const bundle = await prisma.product.create({
            data: {
                title: 'Complete Outfit Bundle',
                handle: 'complete-outfit-bundle',
                descriptionHtml: '<p>Complete outfit bundle with shirt, pants, and accessories. Save when you buy together!</p>',
                status: 'ACTIVE',
                vendor: 'Marvelle',
                productType: 'Combo',
                category: 'Bundles',
                apparelType: 'SET',
                tags: ['bundle', 'combo', 'outfit', 'deal'],
                publishedAt: new Date(),
                collections: {
                    connect: { handle: 'tops' }
                },
                media: {
                    create: {
                        type: 'IMAGE',
                        url: '/images/bundle-outfit.jpg',
                        alt: 'Complete outfit bundle',
                        position: 0
                    }
                },
                options: {
                    create: [
                        {
                            name: 'Size',
                            position: 1,
                            values: ['S', 'M', 'L', 'XL']
                        }
                    ]
                },
                variants: {
                    create: [
                        {
                            title: 'S',
                            position: 1,
                            sku: 'BUNDLE-001-S',
                            price: '3999',
                            compareAtPrice: '5999',
                            taxable: true,
                            trackInventory: true,
                            inventoryPolicy: 'DENY',
                            requiresShipping: true,
                            optionValues: { Size: 'S' },
                            inventoryLevels: {
                                create: {
                                    locationId: location.id,
                                    available: 20,
                                    onHand: 20,
                                    committed: 0,
                                    unavailable: 0
                                }
                            }
                        },
                        {
                            title: 'M',
                            position: 2,
                            sku: 'BUNDLE-001-M',
                            price: '3999',
                            compareAtPrice: '5999',
                            taxable: true,
                            trackInventory: true,
                            inventoryPolicy: 'DENY',
                            requiresShipping: true,
                            optionValues: { Size: 'M' },
                            inventoryLevels: {
                                create: {
                                    locationId: location.id,
                                    available: 20,
                                    onHand: 20,
                                    committed: 0,
                                    unavailable: 0
                                }
                            }
                        },
                        {
                            title: 'L',
                            position: 3,
                            sku: 'BUNDLE-001-L',
                            price: '3999',
                            compareAtPrice: '5999',
                            taxable: true,
                            trackInventory: true,
                            inventoryPolicy: 'DENY',
                            requiresShipping: true,
                            optionValues: { Size: 'L' },
                            inventoryLevels: {
                                create: {
                                    locationId: location.id,
                                    available: 20,
                                    onHand: 20,
                                    committed: 0,
                                    unavailable: 0
                                }
                            }
                        },
                        {
                            title: 'XL',
                            position: 4,
                            sku: 'BUNDLE-001-XL',
                            price: '3999',
                            compareAtPrice: '5999',
                            taxable: true,
                            trackInventory: true,
                            inventoryPolicy: 'DENY',
                            requiresShipping: true,
                            optionValues: { Size: 'XL' },
                            inventoryLevels: {
                                create: {
                                    locationId: location.id,
                                    available: 20,
                                    onHand: 20,
                                    committed: 0,
                                    unavailable: 0
                                }
                            }
                        }
                    ]
                },
                // Create metafields for bundle items
                metafields: {
                    create: [
                        {
                            namespace: 'custom',
                            key: 'combo_items',
                            type: 'list.single_line_text_field',
                            value: JSON.stringify(products.map(p => p.handle))
                        },
                        {
                            namespace: 'custom',
                            key: 'bundle_items',
                            type: 'list.single_line_text_field',
                            value: JSON.stringify(products.map(p => p.handle))
                        }
                    ]
                }
            },
            include: {
                metafields: true,
                variants: true
            }
        });

        console.log('\n✓ Bundle product created successfully!');
        console.log(`  Title: ${bundle.title}`);
        console.log(`  Handle: ${bundle.handle}`);
        console.log(`  Metafields: ${bundle.metafields.length}`);
        console.log(`  Variants: ${bundle.variants.length}`);
        console.log(`\nMetafield values:`);
        bundle.metafields.forEach(mf => {
            console.log(`  - ${mf.key}: ${mf.value}`);
        });
        console.log(`\nView at: http://localhost:5173/product/${bundle.handle}`);

    } catch (error) {
        console.error('Error creating bundle product:', error);
    } finally {
        await prisma.$disconnect();
    }
}

createBundleProduct();
