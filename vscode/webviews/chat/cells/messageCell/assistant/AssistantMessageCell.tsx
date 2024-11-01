import {
    type ChatMessage,
    ContextItemSource,
    type Guardrails,
    type Model,
    ModelTag,
    type PromptString,
    contextItemsFromPromptEditorValue,
    filterContextItemsFromPromptEditorValue,
    isAbortErrorOrSocketHangUp,
    reformatBotMessageForChat,
    serializedPromptEditorStateFromChatMessage,
} from '@sourcegraph/cody-shared'
import type { PromptEditorRefAPI } from '@sourcegraph/prompt-editor'
import isEqual from 'lodash/isEqual'
import { type FunctionComponent, type RefObject, memo, useMemo } from 'react'
import type { ApiPostMessage, UserAccountInfo } from '../../../../Chat'
import { chatModelIconComponent } from '../../../../components/ChatModelIcon'
import {
    ChatMessageContent,
    type CodeBlockActionsProps,
} from '../../../ChatMessageContent/ChatMessageContent'
import { ErrorItem, RequestErrorItem } from '../../../ErrorItem'
import { type Interaction, editHumanMessage } from '../../../Transcript'
import { FeedbackButtons } from '../../../components/FeedbackButtons'
import { LoadingDots } from '../../../components/LoadingDots'
import { BaseMessageCell, MESSAGE_CELL_AVATAR_SIZE } from '../BaseMessageCell'
import { ContextFocusActions } from './ContextFocusActions'

/**
 * A small component that displays a copy icon.
 */
const CopyIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg
        role="img"
        height={16}
        width={16}
        viewBox="0 0 16 16"
        fill="currentColor"
        className={className}
        aria-label="Copy icon"
    >
        <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M4 4l1-1h5.414L14 6.586V14l-1 1H5l-1-1V4zm9 3l-3-3H5v10h8V7z"
        />
        <path fillRule="evenodd" clipRule="evenodd" d="M3 1L2 2v10l1 1V2h6.414l-1-1H3z" />
    </svg>
)

/**
 * A component that displays a chat message from the assistant.
 */
export const AssistantMessageCell: FunctionComponent<{
    message: ChatMessage
    models: Model[]
    /** Information about the human message that led to this assistant response. */
    humanMessage: PriorHumanMessageInfo | null

    userInfo: UserAccountInfo
    chatEnabled: boolean
    isLoading: boolean

    showFeedbackButtons: boolean
    feedbackButtonsOnSubmit?: (text: string) => void

    copyButtonOnSubmit?: CodeBlockActionsProps['copyButtonOnSubmit']
    insertButtonOnSubmit?: CodeBlockActionsProps['insertButtonOnSubmit']

    smartApplyEnabled?: boolean
    smartApply?: CodeBlockActionsProps['smartApply']

    postMessage?: ApiPostMessage
    guardrails?: Guardrails
}> = memo(
    ({
        message,
        models,
        humanMessage,
        userInfo,
        chatEnabled,
        isLoading,
        showFeedbackButtons,
        feedbackButtonsOnSubmit,
        copyButtonOnSubmit,
        insertButtonOnSubmit,
        postMessage,
        guardrails,
        smartApply,
        smartApplyEnabled,
    }) => {
        const displayMarkdown = useMemo(
            () => (message.text ? reformatBotMessageForChat(message.text).toString() : ''),
            [message.text]
        )

        const chatModel = useChatModelByID(message.model, models)
        const ModelIcon = chatModel ? chatModelIconComponent(chatModel.id) : null
        const isAborted = isAbortErrorOrSocketHangUp(message.error)

        const hasLongerResponseTime = chatModel?.tags?.includes(ModelTag.StreamDisabled)

        return (
            <BaseMessageCell
                speakerIcon={ModelIcon ? <ModelIcon size={NON_HUMAN_CELL_AVATAR_SIZE} /> : null}
                speakerTitle={
                    <span data-testid="chat-model">
                        {chatModel
                            ? chatModel.title ?? `Model ${chatModel.id} by ${chatModel.provider}`
                            : 'Model'}
                    </span>
                }
                content={
                    <>
                        {message.error && !isAborted ? (
                            typeof message.error === 'string' ? (
                                <RequestErrorItem error={message.error} />
                            ) : (
                                <ErrorItem
                                    error={message.error}
                                    userInfo={userInfo}
                                    postMessage={postMessage}
                                />
                            )
                        ) : null}
                        {displayMarkdown ? (
                            <ChatMessageContent
                                displayMarkdown={displayMarkdown}
                                isMessageLoading={isLoading}
                                copyButtonOnSubmit={copyButtonOnSubmit}
                                insertButtonOnSubmit={insertButtonOnSubmit}
                                guardrails={guardrails}
                                humanMessage={humanMessage}
                                smartApplyEnabled={smartApplyEnabled}
                                smartApply={smartApply}
                            />
                        ) : (
                            isLoading && (
                                <div>
                                    {hasLongerResponseTime && (
                                        <p className="tw-m-4 tw-mt-0 tw-text-muted-foreground">
                                            This model may take longer to respond because it takes time
                                            to "think". Recommended for complex reasoning & coding tasks.
                                        </p>
                                    )}
                                    <LoadingDots />
                                </div>
                            )
                        )}
                    </>
                }
                footer={
                    chatEnabled &&
                    humanMessage && (
                        <div className="tw-py-3 tw-flex tw-flex-col tw-gap-2">
                            {isAborted && (
                                <div className="tw-text-sm tw-text-muted-foreground tw-mt-4">
                                    Output stream stopped
                                </div>
                            )}
                            <div className="tw-flex tw-items-center tw-divide-x tw-transition tw-divide-muted tw-opacity-65 hover:tw-opacity-100">
                                {showFeedbackButtons && feedbackButtonsOnSubmit && (
                                    <div className="tw-flex tw-items-center">
                                        <FeedbackButtons
                                            feedbackButtonsOnSubmit={feedbackButtonsOnSubmit}
                                            className="tw-pr-4"
                                        />
                                    </div>
                                )}
                                <div className="tw-pl-4">
                                    <button
                                        type="button"
                                        className="tw-flex tw-items-center tw-gap-2 tw-text-sm tw-text-muted-foreground hover:tw-text-foreground tw-mx-4"
                                        onClick={() => {
                                            navigator.clipboard.writeText(message.text?.toString() || '')
                                            copyButtonOnSubmit?.(message.text?.toString() || '')
                                        }}
                                    >
                                        <CopyIcon />
                                    </button>
                                </div>
                                {!isLoading && (!message.error || isAborted) && (
                                    <ContextFocusActions
                                        humanMessage={humanMessage}
                                        longResponseTime={hasLongerResponseTime}
                                        className={
                                            showFeedbackButtons && feedbackButtonsOnSubmit
                                                ? 'tw-pl-5'
                                                : undefined
                                        }
                                    />
                                )}
                            </div>
                        </div>
                    )
                }
            />
        )
    },
    isEqual
)

export const NON_HUMAN_CELL_AVATAR_SIZE =
    MESSAGE_CELL_AVATAR_SIZE * 0.83 /* make them "look" the same size as the human avatar icons */

export interface HumanMessageInitialContextInfo {
    repositories: boolean
    files: boolean
}

export interface PriorHumanMessageInfo {
    text?: PromptString
    hasInitialContext: HumanMessageInitialContextInfo
    rerunWithDifferentContext: (withInitialContext: HumanMessageInitialContextInfo) => void

    hasExplicitMentions: boolean
    appendAtMention: () => void
}

export function makeHumanMessageInfo(
    { humanMessage, assistantMessage }: Interaction,
    humanEditorRef: RefObject<PromptEditorRefAPI>
): PriorHumanMessageInfo {
    if (assistantMessage === null) {
        throw new Error('unreachable')
    }

    const editorValue = serializedPromptEditorStateFromChatMessage(humanMessage)
    const contextItems = contextItemsFromPromptEditorValue(editorValue)

    return {
        text: humanMessage.text,
        hasInitialContext: {
            repositories: Boolean(
                contextItems.some(item => item.type === 'repository' || item.type === 'tree')
            ),
            files: Boolean(
                contextItems.some(
                    item => item.type === 'file' && item.source === ContextItemSource.Initial
                )
            ),
        },
        rerunWithDifferentContext: withInitialContext => {
            const editorValue = humanEditorRef.current?.getSerializedValue()
            if (editorValue) {
                const newEditorValue = filterContextItemsFromPromptEditorValue(
                    editorValue,
                    item =>
                        ((item.type === 'repository' || item.type === 'tree') &&
                            withInitialContext.repositories) ||
                        (item.type === 'file' && withInitialContext.files)
                )
                editHumanMessage({
                    messageIndexInTranscript: assistantMessage.index - 1,
                    editorValue: newEditorValue,
                    intent: humanMessage.intent,
                })
            }
        },
        hasExplicitMentions: Boolean(contextItems.some(item => item.source === ContextItemSource.User)),
        appendAtMention: () => {
            if (humanEditorRef.current?.getSerializedValue().text.trim().endsWith('@')) {
                humanEditorRef.current?.setFocus(true, { moveCursorToEnd: true })
            } else {
                humanEditorRef.current?.appendText('@')
            }
        },
    }
}

function useChatModelByID(
    model: string | undefined,
    chatModels: Model[]
): Pick<Model, 'id' | 'title' | 'provider' | 'tags'> | undefined {
    return (
        chatModels?.find(m => m.id === model) ??
        (model
            ? {
                  id: model,
                  title: model,
                  provider: 'unknown',
                  tags: [],
              }
            : undefined)
    )
}
