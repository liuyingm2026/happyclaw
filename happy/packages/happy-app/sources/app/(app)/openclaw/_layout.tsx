import { Stack } from 'expo-router';
import * as React from 'react';
import { Typography } from '@/constants/Typography';
import { useUnistyles } from 'react-native-unistyles';
import { t } from '@/text';

export default function OpenClawLayout() {
    const { theme } = useUnistyles();

    return (
        <Stack
            screenOptions={{
                headerShown: false,
                headerShadowVisible: false,
                contentStyle: {
                    backgroundColor: theme.colors.groupped.background,
                },
                headerStyle: {
                    backgroundColor: theme.colors.header.background,
                },
                headerTintColor: theme.colors.header.tint,
                headerTitleStyle: {
                    color: theme.colors.header.tint,
                    ...Typography.default('semiBold'),
                },
                headerBackTitle: t('common.back'),
            }}
        >
            <Stack.Screen
                name="[id]"
                options={{
                    headerShown: false,
                }}
            />
        </Stack>
    );
}
