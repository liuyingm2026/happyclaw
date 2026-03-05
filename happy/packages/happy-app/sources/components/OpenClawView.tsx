import * as React from 'react';
import {
    View,
    Text,
    Pressable,
    ActivityIndicator,
    FlatList,
    RefreshControl,
} from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { t } from '@/text';
import { Typography } from '@/constants/Typography';
import { StatusDot } from './StatusDot';
import {
    useOpenClawConversations,
    useOpenClawGatewayStatus,
    useOpenClawLoaded,
} from '@/sync/storage';
import { sync } from '@/sync/sync';
import { OpenClawConversation } from '@/sync/storageTypes';
import { Item } from './Item';
import { layout } from './layout';

export const OpenClawView = React.memo(() => {
    const { theme } = useUnistyles();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const conversations = useOpenClawConversations();
    const gatewayStatus = useOpenClawGatewayStatus();
    const isLoaded = useOpenClawLoaded();
    const [refreshing, setRefreshing] = React.useState(false);

    const onRefresh = React.useCallback(async () => {
        setRefreshing(true);
        await sync.invalidateOpenClaw();
        setRefreshing(false);
    }, []);

    const handleConversationPress = React.useCallback((conversationId: string) => {
        router.push(`/openclaw/${conversationId}` as any);
    }, [router]);

    const renderConversation = React.useCallback(({ item }: { item: OpenClawConversation }) => (
        <ConversationItem
            conversation={item}
            onPress={() => handleConversationPress(item.id)}
        />
    ), [handleConversationPress]);

    if (!isLoaded) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color={theme.colors.textSecondary} />
            </View>
        );
    }

    return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
            {/* Gateway Status Header */}
            <View style={styles.statusHeader}>
                <View style={styles.statusRow}>
                    <StatusDot
                        color={gatewayStatus.connected ? theme.colors.status.connected : theme.colors.status.disconnected}
                        size={8}
                        style={{ marginRight: 8 }}
                    />
                    <Text style={styles.statusText}>
                        {gatewayStatus.connected
                            ? t('openclaw.gatewayConnected')
                            : t('openclaw.gatewayDisconnected')}
                    </Text>
                </View>
                {gatewayStatus.gatewayUrl && (
                    <Text style={styles.gatewayUrl}>{gatewayStatus.gatewayUrl}</Text>
                )}
            </View>

            {/* Conversations List */}
            {conversations.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <Ionicons name="chatbubbles-outline" size={48} color={theme.colors.textSecondary} />
                    <Text style={styles.emptyTitle}>{t('openclaw.noConversations')}</Text>
                    <Text style={styles.emptySubtitle}>{t('openclaw.noConversationsHint')}</Text>
                </View>
            ) : (
                <FlatList
                    data={conversations}
                    keyExtractor={(item) => item.id}
                    renderItem={renderConversation}
                    contentContainerStyle={styles.listContent}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            tintColor={theme.colors.textSecondary}
                        />
                    }
                />
            )}
        </View>
    );
});

interface ConversationItemProps {
    conversation: OpenClawConversation;
    onPress: () => void;
}

const ConversationItem = React.memo(({ conversation, onPress }: ConversationItemProps) => {
    const { theme } = useUnistyles();

    const timeAgo = React.useMemo(() => {
        const diff = Date.now() - conversation.lastActiveAt;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return t('time.justNow');
        if (minutes < 60) return t('time.minutesAgo', { count: minutes });
        if (hours < 24) return t('time.hoursAgo', { count: hours });
        return t('time.daysAgo', { count: days });
    }, [conversation.lastActiveAt]);

    const unreadBadge = (conversation.unreadCount ?? 0) > 0 ? (
        <View style={itemStyles.badge}>
            <Text style={itemStyles.badgeText}>
                {conversation.unreadCount}
            </Text>
        </View>
    ) : null;

    return (
        <Item
            onPress={onPress}
            title={conversation.title || t('openclaw.newConversation')}
            subtitle={conversation.lastMessagePreview || timeAgo}
            icon={
                <View style={itemStyles.iconContainer}>
                    <Ionicons
                        name="chatbubble-outline"
                        size={24}
                        color={theme.colors.text}
                    />
                </View>
            }
            rightElement={unreadBadge}
        />
    );
});

const styles = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.colors.groupped.background,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: theme.colors.groupped.background,
    },
    statusHeader: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: theme.colors.groupped.background,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.divider,
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    statusText: {
        fontSize: 14,
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    gatewayUrl: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        marginTop: 4,
        ...Typography.default(),
    },
    listContent: {
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 32,
    },
    emptyTitle: {
        fontSize: 18,
        color: theme.colors.text,
        ...Typography.default('semiBold'),
        marginTop: 16,
    },
    emptySubtitle: {
        fontSize: 14,
        color: theme.colors.textSecondary,
        marginTop: 8,
        textAlign: 'center',
        ...Typography.default(),
    },
}));

const itemStyles = StyleSheet.create((theme) => ({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: theme.colors.surface,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    contentContainer: {
        flex: 1,
    },
    title: {
        fontSize: 16,
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    preview: {
        fontSize: 14,
        color: theme.colors.textSecondary,
        marginTop: 2,
        ...Typography.default(),
    },
    time: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        marginTop: 4,
        ...Typography.default(),
    },
    badge: {
        backgroundColor: theme.colors.status.error,
        borderRadius: 10,
        minWidth: 20,
        height: 20,
        paddingHorizontal: 6,
        justifyContent: 'center',
        alignItems: 'center',
    },
    badgeText: {
        color: '#FFFFFF',
        fontSize: 12,
        ...Typography.default('semiBold'),
    },
}));
