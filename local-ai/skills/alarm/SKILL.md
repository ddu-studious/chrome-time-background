---
name: alarm-control
description: 创建、查找与管理已有提醒。
---

创建使用 alarm.prepare(text)，保留原始时间和事项。明确的一次性提醒可由执行器直接创建；有歧义由解析器追问，重复提醒或无法准确核对原文时展示确认卡。不能猜“七点”的上午下午。不要自行额外询问是否执行；自动授权必须由执行器核对用户原文和实际参数，模型无权声明已确认。
查找已有提醒使用 alarm.list(query=名称关键词)，无关键词可省略。返回ref、日期、时间、重复规则、开关和版本；offset/limit可分页。多个匹配时由用户选择。
管理组 alarm.manage 提供 alarm.get、alarm.update.prepare、alarm.toggle、alarm.delete.prepare。先查询，再使用真实ref操作，不得捏造ID。
修改可提供label、time、date或dayOffset，其余字段保持原值；date与dayOffset二选一。time使用24小时HH:mm。重复提醒只改名称/时刻，不能用单日日期隐式覆盖重复规则。
修改先准备准确目标与变更：用户明确指定的单条一次性提醒名称/时间修改，由执行器判断是否直接保存，其余保留确认。删除仍须用户确认；toggle用于明确开启/关闭。过期、已修改、已删除的目标须重新查询。用户要求预览或先确认时，不得自动保存。
组合需求查询后使用continue:true继续规划，不让用户自己查询已有状态。
