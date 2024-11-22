import { z } from "zod";

import { safeInteger } from "../utils/common";

export const queueIdSchema = z.strictObject({
	queueId: z
		.string()
		.toUpperCase()
		.length(24)
		.regex(/^[A-Z0-9]{24}$/, {
			message: "Invalid queue id"
		})
});

export const queuesQuerySchema = z.strictObject({
	limit: z
		.optional(
			z
				.string()
				.min(1)
				.max(4)
				.regex(/^[0-9]{1,4}$/)
				.transform((v) => safeInteger(v))
				.pipe(z.number().gte(1).lte(1000))
		)
		.default("10"),
	offset: z
		.optional(
			z
				.string()
				.min(1)
				.max(4)
				.regex(/^[0-9]{1,4}$/)
				.transform((v) => safeInteger(v))
				.pipe(z.number().gte(0).lte(1000))
		)
		.default("0"),
	order: z
		.optional(z.union([z.literal("createdAt"), z.literal("estimateEndAt"), z.literal("estimateExecutionAt")]))
		.default("createdAt"),
	sort: z.optional(z.union([z.literal("asc"), z.literal("desc")])).default("asc"),
	state: z.optional(
		z
			.string()
			.toUpperCase()
			.pipe(
				z.union([
					z.literal("RUNNING"),
					z.literal("ERROR"),
					z.literal("SUCCESS"),
					z.literal("PAUSED"),
					z.literal("REVOKED")
				])
			)
	)
});
