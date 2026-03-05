import * as React from 'react';
import { OpenClawChatView } from '@/components/OpenClawChatView';
import { useRouter, useLocalSearchParams } from 'expo-router';

export default function OpenClawChatScreen() {
    const router = useRouter();
    const { id } = useLocalSearchParams<{ id: string }>();

    const handleBack = React.useCallback(() => {
        router.back();
    }, [router]);

    if (!id) {
        return null;
    }

    return <OpenClawChatView conversationId={id} onBack={handleBack} />;
}
