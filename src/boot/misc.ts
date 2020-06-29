import { boot } from 'quasar/wrappers'
import * as State from 'src/state'
import AuthenticationDialog from 'pages/AuthenticationDialog.vue'
import { Storage } from 'core/storage'
import { QSpinnerIos, DialogChainObject } from 'quasar'
import AsyncComputed from 'vue-async-computed'
import ActionSheets from 'pages/ActionSheets.vue'
import SigningDialog from 'pages/SigningDialog.vue'

declare global {
    type AuthenticateOptions = {
        /** customized title text */
        title?: string
    }
}

declare module 'vue/types/vue' {
    interface Vue {
        $state: ReturnType<typeof State.build>

        $storage: Storage

        /**
         * pop up the authentication dialog to ask user entering password,
         * then run the given task and return the result
         * @param task a task which requires the password to finish
         * @param options
         */
        $authenticate<T>(
            task: (password: string) => Promise<T>,
            options?: AuthenticateOptions
        ): Promise<T>

        /**
         * protected the async task with a loading mask
         * @param task the async task
         * @returns the result of the task
         */
        $loading<T>(task: () => Promise<T>): Promise<T>

        /** display an action sheets */
        $actionSheets(actions: Array<{ label: string, classes?: string | string[], onClick?: Function }>): void

        /** to sign something
         * TODO: args and return value
         */
        $sign(): Promise<unknown>
    }
}

export default boot(async ({ Vue }) => {
    const state = State.build()
    const storage = await Storage.init()
    let loadingCount = 0

    const delayedSpinner = Vue.component('DelayedSpinner', {
        data: () => { return { display: false } },
        props: { color: String, size: Number },
        created() { setTimeout(() => { this.display = true }, 200) },
        render(h) {
            if (!this.display) {
                return h()
            }
            const spinner = h(QSpinnerIos, { props: this.$props })
            return h('transition', {
                props: {
                    name: 'q-transition--fade',
                    appear: true
                }
            }, [spinner])
        }
    })

    let signingDialog: DialogChainObject | undefined

    Object.defineProperties(Vue.prototype, {
        $state: {
            get() { return state }
        },
        $storage: {
            get() { return storage }
        },
        $authenticate: {
            get(): Vue['$authenticate'] {
                const vm = this as Vue
                return (task, options) => {
                    return new Promise((resolve, reject) => {
                        options = options || {}
                        vm.$q.dialog({
                            component: AuthenticationDialog,
                            parent: vm,
                            task,
                            title: options.title
                        })
                            .onOk(resolve)
                            .onCancel(() => reject(new Error('cancelled')))
                    })
                }
            }
        },
        $loading: {
            get(): Vue['$loading'] {
                const root = (this as Vue).$root
                return async (task) => {
                    try {
                        if (loadingCount++ === 0) {
                            // set 0 delay to block mouse/touch event
                            root.$q.loading.show({
                                spinner: delayedSpinner as unknown as Vue,
                                delay: 0,
                                backgroundColor: 'transparent',
                                spinnerColor: 'black'
                            })
                        }
                        return await task()
                    } finally {
                        if (--loadingCount === 0) {
                            root.$q.loading.hide()
                        }
                    }
                }
            }
        },
        $actionSheets: {
            get(): Vue['$actionSheets'] {
                const vm = this as Vue
                return actions => {
                    vm.$q.dialog({
                        component: ActionSheets,
                        parent: vm,
                        actions
                    })
                }
            }
        },
        $sign: {
            get(): Vue['$sign'] {
                const vm = this as Vue
                return () => {
                    return new Promise((resolve, reject) => {
                        // close the previous signing dialog if one opened
                        if (signingDialog) {
                            signingDialog.hide()
                            signingDialog = undefined
                        }
                        const obj = vm.$q.dialog({
                            component: SigningDialog,
                            parent: vm
                        })
                            .onOk(resolve)
                            .onCancel(() => reject(new Error('cancelled')))
                            .onDismiss(() => {
                                if (obj === signingDialog) {
                                    signingDialog = undefined
                                }
                            })

                        signingDialog = obj
                    })
                }
            }
        }
    })

    Vue.use(AsyncComputed)
})
