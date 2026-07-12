const { z } = require("zod");

const orderItemSchema = z.object({
  name: z.string().trim().min(1, "Product name is required."),
  sku: z.string().trim().max(64).optional(),
  price: z.coerce.number().positive("Price must be greater than 0."),
  quantity: z.coerce.number().int().min(1).default(1),
  product_id: z.coerce.number().int().positive("product_id must be a positive integer."),
  variant_id: z.coerce.number().int().positive("variant_id must be a positive integer."),
  tax: z.coerce.number().nonnegative().optional(),
  discount: z.coerce.number().nonnegative().optional(),
  hsn: z.union([z.string().trim().min(1), z.number().int().nonnegative()]).optional(),
});

const createShiprocketOrderSchema = z
  .object({
    orderId: z.string().trim().min(1).max(64).optional(),
    orderDate: z.string().trim().min(1).optional(),
    pickupLocation: z.string().trim().min(1).max(100).optional(),
    paymentMethod: z.enum(["Prepaid", "COD"]).default("Prepaid"),
    notes: z.string().trim().max(500).optional(),
    customer: z.object({
      name: z.string().trim().min(2, "Customer name is required."),
      email: z.string().trim().email("A valid email address is required."),
      phone: z.string().trim().min(10).max(15),
      address: z.string().trim().min(5, "Address is required."),
      address2: z.string().trim().max(255).optional(),
      city: z.string().trim().min(2, "City is required."),
      state: z.string().trim().min(2, "State is required."),
      pincode: z
        .string()
        .trim()
        .regex(/^\d{6}$/, "Pincode must be a 6-digit Indian PIN code."),
      country: z.string().trim().min(2).optional(),
    }),
    item: orderItemSchema.optional(),
    items: z.array(orderItemSchema).min(1).optional(),
    package: z
      .object({
        weight: z.coerce.number().positive().optional(),
        length: z.coerce.number().positive().optional(),
        breadth: z.coerce.number().positive().optional(),
        height: z.coerce.number().positive().optional(),
      })
      .optional(),
  })
  .refine(
    (value) => Boolean(value.item || (Array.isArray(value.items) && value.items.length)),
    {
      message: "Provide at least one product item.",
      path: ["items"],
    },
  );

const trackingQuerySchema = z
  .object({
    awb: z.string().trim().min(1).optional(),
    orderId: z.string().trim().min(1).optional(),
  })
  .refine((value) => Boolean(value.awb || value.orderId), {
    message: "Provide either an AWB number or a Shiprocket order ID.",
    path: ["awb"],
  });

const serviceabilityQuerySchema = z.object({
  pickupPostcode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Pickup postcode must be a 6-digit PIN code."),
  deliveryPostcode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Delivery postcode must be a 6-digit PIN code."),
  weight: z.coerce.number().positive().default(0.5),
  cod: z.coerce.number().int().min(0).max(1).default(1),
});

module.exports = {
  createShiprocketOrderSchema,
  trackingQuerySchema,
  serviceabilityQuerySchema,
};
