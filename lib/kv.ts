import { createClient } from "@vercel/kv";

const getKvClient = () => {
    const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

    if (url && token) {
        return createClient({
            url,
            token,
        });
    }
    return null;
};

export const kv = getKvClient();

export const getKvData = async <T>(key: string): Promise<T | null> => {
    if (!kv) return null;
    try {
        return await kv.get<T>(key);
    } catch (error) {
        console.warn(`Failed to fetch key ${key} from KV:`, error);
        return null;
    }
};
