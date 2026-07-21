"use client";

const REFERRAL_ACCOUNT = process.env.NEXT_PUBLIC_JUPITER_REFERRAL_ACCOUNT || undefined;
const REFERRAL_FEE_BPS = Number(process.env.NEXT_PUBLIC_JUPITER_REFERRAL_FEE_BPS ?? 50);

export default function JupiterSwapButton({
    inputMint,
    outputMint,
    label = "Swap ↗",
    style,
}: {
    inputMint: string;
    outputMint: string;
    label?: string;
    style?: React.CSSProperties;
}) {
    const open = async () => {
        const { init } = await import("@jup-ag/plugin");
        init({
            displayMode: "modal",
            formProps: {
                initialInputMint: inputMint,
                initialOutputMint: outputMint,
                swapMode: "ExactIn",
                // referralAccount must exist first - create one at referral.jup.ag,
                // otherwise the modal opens with no platform fee attached.
                ...(REFERRAL_ACCOUNT ? { referralAccount: REFERRAL_ACCOUNT, referralFee: REFERRAL_FEE_BPS } : {}),
            },
        });
    };

    return (
        <button
            onClick={open}
            style={{
                color: "#52f0cb",
                background: "none",
                border: "none",
                padding: 0,
                font: "inherit",
                cursor: "pointer",
                textDecoration: "underline",
                ...style,
            }}
        >
            {label}
        </button>
    );
}
