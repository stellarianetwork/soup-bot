import config from "./config";
import { Masto, Status } from "masto";
import strinptags from "striptags";
import dayjs from "dayjs";
import "dayjs/locale/ja";
import relativeTime from "dayjs/plugin/relativeTime";
import localizedFormat from "dayjs/plugin/localizedFormat";

dayjs.locale("ja");
dayjs.extend(relativeTime);
dayjs.extend(localizedFormat);

type quiz = {
    isInProgress: boolean;
    title: string | null;
    by: string | null;
    questionCount: number;
    submitCount: number;
    startedAt: Date | null;
    startedTootId: string | null;
};

let quiz: quiz;

const resetQuiz = () => {
    quiz = {
        isInProgress: false,
        title: null,
        by: null,
        questionCount: 0,
        submitCount: 0,
        startedAt: null,
        startedTootId: null,
    };
    return;
};

const initQuiz = (question: string, by: string) => {
    quiz = {
        isInProgress: true,
        title: question,
        by: by,
        questionCount: 0,
        submitCount: 0,
        startedAt: new Date(),
        startedTootId: null,
    };
    return;
};
const incrementQuizQuestionCount = () => {
    quiz.questionCount++;
    return;
};
const incrementQuizSubmitCount = () => {
    quiz.submitCount++;
    return;
};

type Answer = boolean | "unrelated";

// true:        43.75% 5626 ~ 10000
// false:       43.75% 1251 ~ 5625
// "unrelated": 12.50% 1    ~ 1250
const getAnswer = ((unrelatedFlag: boolean = false): Answer => {
    // 1 ~ 10000
    const r = Math.floor(Math.random() * 10000) + 1;
    if (unrelatedFlag) {
        return r < 5625 ? (r < 1250 ? "unrelated" : false) : true;
    } else {
        return r < 5000 ? false : true;
    }
}) as {
    (): boolean;
    (unrelatedFlag: true): Answer;
};

const getQuestionAnswer = (answer: Answer) => {
    if (answer === "unrelated") {
        return "😐 無関係です";
    } else {
        return answer ? "⭕ はい！" : "❌ いいえ！";
    }
};
const getQuizAnswer = (answer: boolean) => {
    return answer ? "⭕ 正解！" : "❌ 不正解！";
};

resetQuiz();

(async () => {
    const masto = await Masto.login({
        uri: config.bot.uri,
        accessToken: config.bot.accessToken,
    });

    const botAccount = await masto.verifyCredentials();
    const botAcct = botAccount.acct;
    console.log(`I'am @${botAcct}`);
    console.log(`${botAccount.url}`);

    console.log("Monitor stream...");
    const stream = await masto.streamUser();

    stream.on("notification", (notification) => {
        console.log(
            `Notification Received: ` +
                `@${notification.account.acct} ${notification.type}`
        );

        if (notification.type === "mention" && notification.status) {
            const status = notification.status;
            const content = strinptags(status.content).trim();

            // "@botAcct "から始まらないメンションはめんどくさいので無視
            if (!new RegExp(`^@${botAcct} `).test(content)) {
                console.log("無視", content);
                return;
            }
            // @を含まないcontent
            const content2 = content.replace(new RegExp(`^@${botAcct} `), "");
            console.log(content2);

            if (["start", "st"].includes(content2.split(" ")[0])) {
                const question = content2.match(/^(start|st) (?<q>.+)/)?.groups
                    ?.q;
                if (!question) {
                    console.error(`question is not found: ${content2}`);
                    return;
                }

                initQuiz(question, status.account.acct);
                const postStatus = `問題: ${quiz.title}\n出題者: @${quiz.by}`;
                (async () => {
                    const post = await masto.createStatus({
                        status: postStatus,
                    });
                    quiz.startedTootId = post.id;
                    console.log(`sent: ${postStatus}, ${post.url}`);
                    return;
                })();
            }

            if (["submit", "su"].includes(content2.split(" ")[0])) {
                const submit = content2.match(/^(submit|su) (?<s>.+)/)?.groups
                    ?.s;
                if (!submit) {
                    console.error(`submit is not found: ${content2}`);
                    return;
                }
                if (!quiz.isInProgress) {
                    masto.createStatus({
                        status: `@${status.account.acct} startしてから回答してくださいね`,
                        inReplyToId: status.id,
                    });
                    return;
                }
                if (quiz.questionCount < 2) {
                    masto.createStatus({
                        status: `@${status.account.acct} 何回か質問してから回答してくださいね`,
                        inReplyToId: status.id,
                    });
                    return;
                }
                incrementQuizSubmitCount();
                const answer = getAnswer();
                const quizAnswer = getQuizAnswer(answer);
                let postStatus;
                if (answer) {
                    let answerTime;
                    if (quiz.startedAt) {
                        answerTime = dayjs(quiz.startedAt).toNow(true);
                    }
                    postStatus = `A.${quiz.submitCount}: ${submit} @${status.account.acct}\n${quizAnswer}\n❓ 質問回数: ${quiz.questionCount}回 ❗ 回答回数: ${quiz.submitCount}回 ⏱️ 時間:${answerTime}`;
                    resetQuiz();
                } else {
                    postStatus = `A.${quiz.submitCount}: ${submit} @${status.account.acct}\n${quizAnswer}`;
                }
                (async () => {
                    const post = await masto.createStatus({
                        status: postStatus,
                        inReplyToId: quiz.startedTootId,
                    });
                    console.log(`sent: ${postStatus}, ${post.url}`);
                    return;
                })();
            }

            if (new RegExp(`.+(\\?|？)$`).test(content2)) {
                if (!quiz.isInProgress) {
                    masto.createStatus({
                        status: `@${status.account.acct} startしてから質問してくださいね`,
                        inReplyToId: status.id,
                    });
                    return;
                }
                incrementQuizQuestionCount();
                const answer = getQuestionAnswer(getAnswer(true));
                const postStatus = `Q.${quiz.questionCount}: ${content2} @${status.account.acct}\n${answer}`;
                (async () => {
                    const post = await masto.createStatus({
                        status: postStatus,
                        inReplyToId: quiz.startedTootId,
                    });
                    console.log(`sent: ${postStatus}, ${post.url}`);
                    return;
                })();
            }
        }
    });
})();
