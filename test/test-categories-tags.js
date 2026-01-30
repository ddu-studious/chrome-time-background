/**
 * 分类和标签功能测试脚本
 * 用于测试分类和标签的创建、编辑、删除和关联功能
 */

// 使用立即执行函数表达式(IIFE)来避免全局变量污染
(() => {
    // 模拟Chrome存储API
    window.mockChromeStorage = {
        data: {},
        sync: {
            get: (keys, callback) => {
                console.log('Mock storage get:', keys);
                const result = {};
                if (Array.isArray(keys)) {
                    keys.forEach(key => {
                        if (window.mockChromeStorage.data[key] !== undefined) {
                            result[key] = window.mockChromeStorage.data[key];
                        }
                    });
                } else if (typeof keys === 'string') {
                    if (window.mockChromeStorage.data[keys] !== undefined) {
                        result[keys] = window.mockChromeStorage.data[keys];
                    }
                } else if (keys === null) {
                    Object.assign(result, window.mockChromeStorage.data);
                }
                callback(result);
            },
            set: (items, callback) => {
                console.log('Mock storage set:', items);
                // 确保data是一个对象
                if (!window.mockChromeStorage.data) {
                    window.mockChromeStorage.data = {};
                }
                Object.assign(window.mockChromeStorage.data, items);
                if (callback) callback();
            },
            remove: (keys, callback) => {
                console.log('Mock storage remove:', keys);
                if (Array.isArray(keys)) {
                    keys.forEach(key => {
                        delete window.mockChromeStorage.data[key];
                    });
                } else {
                    delete window.mockChromeStorage.data[keys];
                }
                if (callback) callback();
            }
        }
    };

    // 模拟全局chrome对象
    window.chrome = {
        storage: window.mockChromeStorage.sync
    };

    // 测试数据
    window.testCategories = [
        { id: 'cat1', name: '工作', color: '#FF5733' },
        { id: 'cat2', name: '生活', color: '#33FF57' },
        { id: 'cat3', name: '学习', color: '#3357FF' }
    ];

    window.testTags = [
        { id: 'tag1', name: '紧急', color: '#FF0000' },
        { id: 'tag2', name: '重要', color: '#FFA500' },
        { id: 'tag3', name: '低优先级', color: '#00FF00' }
    ];

    window.testMemos = [
        { 
            id: 'memo1', 
            title: '完成项目报告', 
            text: '需要在周五前完成项目报告', 
            completed: false, 
            categoryId: 'cat1',
            tagIds: ['tag1', 'tag2'] 
        },
        { 
            id: 'memo2', 
            title: '购物清单', 
            text: '牛奶、面包、鸡蛋', 
            completed: false, 
            categoryId: 'cat2',
            tagIds: ['tag3'] 
        },
        { 
            id: 'memo3', 
            title: '学习JavaScript', 
            text: '复习Promise和async/await', 
            completed: true, 
            categoryId: 'cat3',
            tagIds: ['tag2'] 
        }
    ];

    // 初始化测试数据
    function initTestData() {
        // 重置存储数据
        window.mockChromeStorage.data = {};
        
        chrome.storage.set({
            'memosCategories': window.testCategories,
            'memosTags': window.testTags,
            'memos': window.testMemos
        }, () => {
            console.log('测试数据初始化完成');
        });
    }

    // 测试分类操作
    function testCategoryOperations() {
        console.log('===== 测试分类操作 =====');
        
        // 测试添加分类
        const newCategory = { id: 'cat4', name: '娱乐', color: '#9933FF' };
        chrome.storage.get('memosCategories', (result) => {
            const categories = result.memosCategories || [];
            categories.push(newCategory);
            chrome.storage.set({ 'memosCategories': categories }, () => {
                console.log('添加分类成功:', newCategory);
                
                // 测试编辑分类
                chrome.storage.get('memosCategories', (result) => {
                    const categories = result.memosCategories || [];
                    const categoryToEdit = categories.find(c => c.id === 'cat4');
                    if (categoryToEdit) {
                        categoryToEdit.name = '休闲娱乐';
                        categoryToEdit.color = '#CC33FF';
                        chrome.storage.set({ 'memosCategories': categories }, () => {
                            console.log('编辑分类成功:', categoryToEdit);
                            
                            // 测试删除分类
                            chrome.storage.get(['memosCategories', 'memos'], (result) => {
                                let categories = result.memosCategories || [];
                                let memos = result.memos || [];
                                
                                // 更新使用该分类的备忘录
                                memos = memos.map(memo => {
                                    if (memo.categoryId === 'cat4') {
                                        return { ...memo, categoryId: null };
                                    }
                                    return memo;
                                });
                                
                                // 删除分类
                                categories = categories.filter(c => c.id !== 'cat4');
                                
                                chrome.storage.set({ 
                                    'memosCategories': categories,
                                    'memos': memos
                                }, () => {
                                    console.log('删除分类成功，相关备忘录已更新');
                                });
                            });
                        });
                    }
                });
            });
        });
    }

    // 测试标签操作
    function testTagOperations() {
        console.log('===== 测试标签操作 =====');
        
        // 测试添加标签
        const newTag = { id: 'tag4', name: '长期', color: '#9900CC' };
        chrome.storage.get('memosTags', (result) => {
            const tags = result.memosTags || [];
            tags.push(newTag);
            chrome.storage.set({ 'memosTags': tags }, () => {
                console.log('添加标签成功:', newTag);
                
                // 测试编辑标签
                chrome.storage.get('memosTags', (result) => {
                    const tags = result.memosTags || [];
                    const tagToEdit = tags.find(t => t.id === 'tag4');
                    if (tagToEdit) {
                        tagToEdit.name = '长期项目';
                        tagToEdit.color = '#6600CC';
                        chrome.storage.set({ 'memosTags': tags }, () => {
                            console.log('编辑标签成功:', tagToEdit);
                            
                            // 测试删除标签
                            chrome.storage.get(['memosTags', 'memos'], (result) => {
                                let tags = result.memosTags || [];
                                let memos = result.memos || [];
                                
                                // 更新使用该标签的备忘录
                                memos = memos.map(memo => {
                                    if (memo.tagIds && memo.tagIds.includes('tag4')) {
                                        return { 
                                            ...memo, 
                                            tagIds: memo.tagIds.filter(id => id !== 'tag4') 
                                        };
                                    }
                                    return memo;
                                });
                                
                                // 删除标签
                                tags = tags.filter(t => t.id !== 'tag4');
                                
                                chrome.storage.set({ 
                                    'memosTags': tags,
                                    'memos': memos
                                }, () => {
                                    console.log('删除标签成功，相关备忘录已更新');
                                });
                            });
                        });
                    }
                });
            });
        });
    }

    // 测试任务与分类标签关联
    function testTaskCategoryTagAssociation() {
        console.log('===== 测试任务与分类标签关联 =====');
        
        // 创建新任务并关联分类和标签
        const newTask = {
            id: 'memo4',
            title: '新任务测试',
            text: '测试分类和标签关联',
            completed: false,
            categoryId: 'cat1',
            tagIds: ['tag1', 'tag3']
        };
        
        chrome.storage.get('memos', (result) => {
            const memos = result.memos || [];
            memos.push(newTask);
            chrome.storage.set({ 'memos': memos }, () => {
                console.log('创建带分类和标签的新任务成功:', newTask);
                
                // 修改任务的分类和标签
                chrome.storage.get('memos', (result) => {
                    const memos = result.memos || [];
                    const taskToEdit = memos.find(m => m.id === 'memo4');
                    if (taskToEdit) {
                        taskToEdit.categoryId = 'cat2';
                        taskToEdit.tagIds = ['tag2'];
                        chrome.storage.set({ 'memos': memos }, () => {
                            console.log('修改任务的分类和标签成功:', taskToEdit);
                        });
                    }
                });
            });
        });
    }

    // 运行测试
    function runTests() {
        console.log('开始运行测试...');
        initTestData();
        
        // 使用setTimeout来模拟异步操作的顺序
        setTimeout(testCategoryOperations, 100);
        setTimeout(testTagOperations, 500);
        setTimeout(testTaskCategoryTagAssociation, 1000);
        
        // 最后显示所有数据
        setTimeout(() => {
            chrome.storage.get(null, (result) => {
                console.log('测试完成，最终数据状态:', result);
            });
        }, 1500);
    }

    // 运行测试
    runTests();
})();
