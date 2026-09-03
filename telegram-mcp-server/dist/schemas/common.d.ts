import { z } from "zod";
export declare const ChatIdSchema: z.ZodUnion<[z.ZodNumber, z.ZodString]>;
export declare const MessageIdSchema: z.ZodNumber;
export declare enum ResponseFormat {
    MARKDOWN = "markdown",
    JSON = "json"
}
export declare const ResponseFormatSchema: z.ZodDefault<z.ZodNativeEnum<typeof ResponseFormat>>;
//# sourceMappingURL=common.d.ts.map