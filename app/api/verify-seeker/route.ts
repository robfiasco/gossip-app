import { NextResponse } from "next/server";

// Seeker Genesis Token — each holder has their own unique Token-2022 NFT mint.
// Group (collection) address shared by all holders:
const SEEKER_GROUP = "GT22s89nU4iWFkNXj1Bw6uYhJJWDRPpShHt4Bk8f99Te";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

const RPC_URL =
    process.env.SOLANA_RPC_URL ||
    "https://api.mainnet-beta.solana.com";

/**
 * API Route to verify if a Solana wallet holds a Seeker Genesis Token.
 * 
 * Verifies ownership by checking if any of the wallet's Token-2022 NFTs
 * belongs to the defined SEEKER_GROUP.
 * 
 * @param {Request} req - The incoming HTTP request containing the `wallet` search parameter.
 * @returns {Promise<NextResponse>} JSON response indicating ownership status and details.
 */
export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const wallet = searchParams.get("wallet");

    if (!wallet || wallet.length < 32) {
        return NextResponse.json({ hasSeeker: false, error: "missing wallet" }, { status: 400 });
    }

    try {
        // Step 1 — Get all Token-2022 accounts for this wallet
        const accountsRes = await fetch(RPC_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0", id: 1,
                method: "getTokenAccountsByOwner",
                params: [
                    wallet,
                    { programId: TOKEN_2022_PROGRAM },
                    { encoding: "jsonParsed" },
                ],
            }),
        });

        const accountsData = await accountsRes.json();
        const accounts: any[] = accountsData?.result?.value ?? [];

        // Filter to NFT-like (amount=1, decimals=0)
        const nftMints: string[] = accounts
            .filter((a) => {
                const info = a.account?.data?.parsed?.info;
                return Number(info?.tokenAmount?.uiAmount) === 1 && Number(info?.tokenAmount?.decimals) === 0;
            })
            .map((a) => a.account.data.parsed.info.mint as string);

        if (nftMints.length === 0) {
            return NextResponse.json({ hasSeeker: false, tier: 3, reason: "no Token-2022 NFTs found" });
        }

        // Step 2 — Batch-fetch mint accounts and check tokenGroupMember.group
        // Send as a JSON-RPC batch array
        const batchBody = nftMints.map((mint, i) => ({
            jsonrpc: "2.0",
            id: i + 10,
            method: "getAccountInfo",
            params: [mint, { encoding: "jsonParsed" }],
        }));

        const mintInfoRes = await fetch(RPC_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(batchBody),
        });

        const mintInfos = await mintInfoRes.json();
        const responses: any[] = Array.isArray(mintInfos) ? mintInfos : [mintInfos];

        const hasSeeker = responses.some((resp) => {
            const extensions = resp?.result?.value?.data?.parsed?.info?.extensions;
            if (!Array.isArray(extensions)) return false;
            const groupExt = extensions.find((e: any) => e.extension === "tokenGroupMember");
            return groupExt?.state?.group === SEEKER_GROUP;
        });

        return NextResponse.json({ hasSeeker, tier: 3, mintsChecked: nftMints.length });
    } catch (err: any) {
        console.error("[verify-seeker] error:", err?.message ?? err);
        return NextResponse.json({ hasSeeker: false, error: "rpc error" }, { status: 500 });
    }
}
