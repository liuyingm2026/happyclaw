import * as React from 'react';
import {
    View,
    Text,
    TextInput,
    Pressable,
    FlatList,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
} from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Typography } from '@/constants/Typography';
import { t } from '@/text';
import { StatusDot } from './StatusDot';
import {
    useOpenClawConversation,
    useOpenClawMessages,
    useOpenClawStreamingContent,
    useOpenClawGatewayStatus,
} from '@/sync/storage';
import { sync } from '@/sync/sync';
import { OpenClawMessage } from '@/sync/storageTypes';

interface OpenClawChatViewProps {
    conversationId: string;
    onBack?: () => void;
}

export const OpenClawChatView = React.memo(({ conversationId, onBack }: OpenClawChatViewProps) => {
    const { theme } = useUnistyles();
    const insets = useSafeAreaInsets();
    const conversation = useOpenClawConversation(conversationId);
    const messages = useOpenClawMessages(conversationId);
    const streamingContent = useOpenClawStreamingContent(conversationId);
    const gatewayStatus = useOpenClawGatewayStatus();
    const [inputText, setInputText] = React.useState('');
    const [isSending, setIsSending] = React.useState(false);
    const flatListRef = React.useRef<FlatList>(null);

    // Fetch messages when conversation is opened
    React.useEffect(() => {
        sync.fetchOpenClawMessages(conversationId);
    }, [conversationId]);

    // Scroll to bottom when new messages arrive
    React.useEffect(() => {
        if (messages.length > 0) {
            setTimeout(() => {
                flatListRef.current?.scrollToEnd({ animated: true });
            }, 100);
        }
    }, [messages.length, streamingContent?.content]);

    const handleSend = React.useCallback(async () => {
        if (!inputText.trim() || isSending) return;

        const text = inputText.trim();
        setInputText('');
        setIsSending(true);

        try {
            await sync.sendOpenClawMessage(conversationId, text);
        } catch (error) {
            console.error('Failed to send message:', error);
            // Restore the text on error
            setInputText(text);
        } finally {
            setIsSending(false);
        }
    }, [conversationId, inputText, isSending]);

    const renderMessage = React.useCallback(({ item }: { item: OpenClawMessage }) => (
        <MessageBubble message={item} />
    ), []);

    const ListFooterComponent = React.useCallback(() => {
        if (streamingContent) {
            return (
                <View style={styles.streamingContainer}>
                    <Text style={styles.streamingText}>{streamingContent.content}</Text>
                    <View style={styles.typingIndicator}>
                        <Text style={styles.typingDots}>●●●</Text>
                    </View>
                </View>
            );
        }
        return null;
    }, [streamingContent]);

    if (!conversation) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color={theme.colors.textSecondary} />
            </View>
        );
    }

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={insets.top}
        >
            {/* Header */}
            <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
                <Pressable onPress={onBack} hitSlop={8} style={styles.backButton}>
                    <Ionicons
                        name={Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back'}
                        size={24}
                        color={theme.colors.text}
                    />
                </Pressable>
                <View style={styles.headerContent}>
                    <Text style={styles.title} numberOfLines={1}>
                        {conversation.title || t('openclaw.newConversation')}
                    </Text>
                    <View style={styles.statusRow}>
                        <StatusDot
                            color={gatewayStatus.connected ? theme.colors.status.connected : theme.colors.status.disconnected}
                            size={6}
                            style={{ marginRight: 4 }}
                        />
                        <Text style={styles.statusText}>
                            {gatewayStatus.connected ? t('status.connected') : t('status.disconnected')}
                        </Text>
                    </View>
                </View>
            </View>

            {/* Messages */}
            <FlatList
                ref={flatListRef}
                data={messages}
                keyExtractor={(item) => item.id}
                renderItem={renderMessage}
                contentContainerStyle={styles.messagesList}
                ListFooterComponent={ListFooterComponent}
                onContentSizeChange={() => {
                    flatListRef.current?.scrollToEnd({ animated: false });
                }}
            />

            {/* Input */}
            <View style={[styles.inputContainer, { paddingBottom: insets.bottom + 8 }]}>
                <TextInput
                    style={styles.textInput}
                    value={inputText}
                    onChangeText={setInputText}
                    placeholder={t('openclaw.inputPlaceholder')}
                    placeholderTextColor={theme.colors.textSecondary}
                    multiline
                    maxLength={4000}
                    editable={!isSending && gatewayStatus.connected}
                />
                <Pressable
                    style={[
                        styles.sendButton,
                        (!inputText.trim() || isSending || !gatewayStatus.connected) && styles.sendButtonDisabled,
                    ]}
                    onPress={handleSend}
                    disabled={!inputText.trim() || isSending || !gatewayStatus.connected}
                >
                    {isSending ? (
                        <ActivityIndicator size="small" color={theme.colors.button.primary.tint} />
                    ) : (
                        <Ionicons name="send" size={20} color={theme.colors.button.primary.tint} />
                    )}
                </Pressable>
            </View>
        </KeyboardAvoidingView>
    );
});

interface MessageBubbleProps {
    message: OpenClawMessage;
}

const MessageBubble = React.memo(({ message }: MessageBubbleProps) => {
    const { theme } = useUnistyles();
    const isUser = message.role === 'user';

    return (
        <View style={[bubbleStyles.container, isUser ? bubbleStyles.userContainer : bubbleStyles.assistantContainer]}>
            <View style={[bubbleStyles.bubble, isUser ? bubbleStyles.userBubble : bubbleStyles.assistantBubble]}>
                <Text style={[bubbleStyles.text, isUser ? bubbleStyles.userText : bubbleStyles.assistantText]}>
                    {message.content}
                </Text>
            </View>
            <Text style={bubbleStyles.time}>
                {formatTime(message.createdAt)}
            </Text>
        </View>
    );
});

function formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

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
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.divider,
        backgroundColor: theme.colors.surface,
    },
    backButton: {
        marginRight: 12,
        padding: 4,
    },
    headerContent: {
        flex: 1,
    },
    title: {
        fontSize: 18,
        color: theme.colors.text,
        ...Typography.default('semiBold'),
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 2,
    },
    statusText: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        ...Typography.default(),
    },
    messagesList: {
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    streamingContainer: {
        backgroundColor: theme.colors.surface,
        borderRadius: 12,
        padding: 12,
        marginVertical: 8,
        alignSelf: 'flex-start',
        maxWidth: '85%',
    },
    streamingText: {
        fontSize: 15,
        color: theme.colors.text,
        ...Typography.default(),
        lineHeight: 22,
    },
    typingIndicator: {
        marginTop: 8,
    },
    typingDots: {
        fontSize: 12,
        color: theme.colors.textSecondary,
        letterSpacing: 4,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: theme.colors.surface,
        borderTopWidth: 1,
        borderTopColor: theme.colors.divider,
    },
    textInput: {
        flex: 1,
        minHeight: 40,
        maxHeight: 120,
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: theme.colors.groupped.background,
        borderRadius: 20,
        fontSize: 15,
        color: theme.colors.text,
        ...Typography.default(),
    },
    sendButton: {
        marginLeft: 12,
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: theme.colors.button.primary.background,
        justifyContent: 'center',
        alignItems: 'center',
    },
    sendButtonDisabled: {
        opacity: 0.5,
    },
}));

const bubbleStyles = StyleSheet.create((theme) => ({
    container: {
        marginVertical: 4,
        maxWidth: '85%',
    },
    userContainer: {
        alignSelf: 'flex-end',
    },
    assistantContainer: {
        alignSelf: 'flex-start',
    },
    bubble: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 16,
    },
    userBubble: {
        backgroundColor: theme.colors.button.primary.background,
        borderBottomRightRadius: 4,
    },
    assistantBubble: {
        backgroundColor: theme.colors.surface,
        borderBottomLeftRadius: 4,
    },
    text: {
        fontSize: 15,
        lineHeight: 22,
        ...Typography.default(),
    },
    userText: {
        color: theme.colors.button.primary.tint,
    },
    assistantText: {
        color: theme.colors.text,
    },
    time: {
        fontSize: 10,
        color: theme.colors.textSecondary,
        marginTop: 4,
        ...Typography.default(),
    },
}));
