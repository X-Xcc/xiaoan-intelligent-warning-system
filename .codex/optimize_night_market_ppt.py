from __future__ import annotations

from copy import deepcopy
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import re
import xml.etree.ElementTree as ET


NS = {
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
}

ET.register_namespace("a", NS["a"])
ET.register_namespace("p", NS["p"])

SRC_NAME = "新建 PPTX 演示文稿.pptx"
OUT_SUFFIX = "-优化版-底部重写"


def qn(prefix: str, tag: str) -> str:
    return f"{{{NS[prefix]}}}{tag}"


def norm(text: str) -> str:
    return re.sub(r"\s+", "", text or "")


def paragraph_text(p: ET.Element) -> str:
    return "".join((t.text or "") for t in p.findall(".//a:t", NS))


def txbody_text(txbody: ET.Element) -> str:
    return "\n".join(paragraph_text(p) for p in txbody.findall("./a:p", NS)).strip()


def set_paragraph_text(p: ET.Element, text: str) -> None:
    texts = p.findall(".//a:t", NS)
    if not texts:
        run = p.find("./a:r", NS)
        if run is None:
            run = ET.SubElement(p, qn("a", "r"))
            ET.SubElement(run, qn("a", "rPr"))
            ET.SubElement(run, qn("a", "t"))
        texts = p.findall(".//a:t", NS)
    for i, t in enumerate(texts):
        t.text = text if i == 0 else ""


def set_txbody_lines(txbody: ET.Element, lines: list[str]) -> None:
    paras = txbody.findall("./a:p", NS)
    if not paras:
        return
    while len(paras) < len(lines):
        clone = deepcopy(paras[-1])
        for t in clone.findall(".//a:t", NS):
            t.text = ""
        txbody.append(clone)
        paras.append(clone)
    for p in paras[len(lines):]:
        txbody.remove(p)
    for p, line in zip(paras, lines):
        set_paragraph_text(p, line)


def iter_txbodies(root: ET.Element):
    for elem in root.iter():
        if elem.tag.endswith("txBody"):
            yield elem


def slide_replacements(slide_idx: int):
    if slide_idx == 1:
        return {
            norm("夜市安防助力构建智慧治理新生态"): ["夜市智防助力构建智慧治理新生态"],
            norm("宇视安防"): ["宇视安防"],
            norm("视频监控、AIoT"): ["夜市商圈固定点位、园区安防、视频监控"],
            norm("监控强，闭环弱"): ["固定监控强，但盲区补巡和处置闭环弱"],
            norm("海康平台"): ["海康平台"],
            norm("智慧城市、警务"): ["城市治理、警务联动、综合治理平台"],
            norm("平台全，落地重"): ["平台全，但部署重、单夜市试点成本高"],
            norm("大华物联"): ["大华物联"],
            norm("视频物联、安防"): ["文旅街区、商圈安防、视频物联"],
            norm("感知强，流程散"): ["感知强，但跨端流程散、依赖人工串联"],
            norm("感知强，流程散|"): ["感知强，但跨端流程散、依赖人工串联"],
            norm("安保巡更"): ["安保巡更"],
            norm("巡逻打卡、派单"): ["夜市巡防、物业园区、安保队伍"],
            norm("记录强，研判弱"): ["记录强，但预警研判弱、到场慢"],
            norm("记录强，研判弱|"): ["记录强，但预警研判弱、到场慢"],
            norm("夜市"): ["夜市智防"],
            norm("夜市、商圈、文旅"): ["夜市商圈、文旅街区、基层治理"],
            norm("场景准，闭环快"): ["针对竞品痛点：轻量试点、移动补盲、AI研判、派单留证闭环"],
            norm("需求侧数据"): ["场景痛点"],
            norm("夜间文旅点位数百个"): ["夜市客流密集、流动性强"],
            norm("夏夜巡查覆盖夜市商圈"): ["识别难、响应慢、协同弱"],
            norm("产品侧数据"): ["产品闭环"],
            norm("小程序 + 巡防端 + 后台"): ["群众端求助 + 巡防端处置"],
            norm("求助、上报、线索入池"): ["后台研判派单、留证复盘"],
            norm("落地侧数据"): ["落地路径"],
            norm("单个夜市即可试点"): ["单点轻量试点、快速验证"],
            norm("优先接入存量设备"): ["接入存量设备、降低成本"],
        }
    if slide_idx == 2:
        return {
            norm("全面负责产品研发与公司运营"): [
                "全面负责产品研发与公司运营",
                "统筹项目立项、产品路线和版本迭代，推进试点沟通与对外展示。",
            ],
            norm("多次参与夜市治理"): [
                "多次参与夜市治理",
                "走访夜市商圈，梳理摊位、客流、巡查和求助流程，沉淀一线需求。",
            ],
            norm("多次与其他高校进行技术交流与合作"): [
                "多次与其他高校进行技术交流与合作",
                "参与跨校交流，吸收AI识别、前后端联调和产品表达建议。",
            ],
            norm("受邀参加城市治理讲座"): [
                "受邀参加城市治理讲座",
                "从基层治理和协同处置视角，完善项目场景和答辩逻辑。",
            ],
            norm("创办长明灯项目，在职业院校技能大赛获奖"): [
                "创办长明灯项目，在职业院校技能大赛获奖",
                "负责申报、路演和答辩组织，积累完整赛事经验。",
            ],
            norm("带动多名同学，多次参与项目调研"): [
                "带动多名同学，多次参与项目调研",
                "组织现场走访和任务分工，提升团队协作与问题归纳效率。",
            ],
            norm("正在申请相关软著"): ["正在申请相关软著，沉淀知识产权成果。"],
        }
    if slide_idx == 3:
        return {
            norm("团队成员分工明确，均参与项目调研、原型建设与创赛实践"): [
                "团队成员分工明确，形成从需求到交付的完整协作链",
            ],
            norm("团队成员分工明确，覆盖场景调研、产品策划、视觉设计、AI研判、后端开发和商业测算，形成从需求到交付的完整协作链。"): [
                "团队成员分工明确，形成从需求到交付的完整协作链",
            ],
            norm("项目执行"): ["项目执行"],
            norm("视觉交互"): ["视觉交互"],
            norm("产品策划"): ["PPT制作"],
            norm("技术开发"): ["市场推广"],
            norm("跟进项目任务进度汇总创赛支撑材料协调成员按期交付"): [
                "梳理项目任务节点",
                "跟进阶段交付进度",
                "协调成员按期完成",
            ],
            norm("跟进项目任务进度、汇总创赛支撑材料、协调成员按期交付"): [
                "梳理项目任务节点",
                "跟进阶段交付进度",
                "协调成员按期完成",
            ],
            norm("推进项目落地，把控执行质量"): [
                "把控执行节奏，保障交付质量",
            ],
            norm("设计小程序页面视觉优化群众端操作体验整理产品展示截图"): [
                "对接项目视觉需求",
                "统一展示素材风格",
                "优化版式与视觉层级",
            ],
            norm("设计小程序页面视觉、优化群众端操作体验、整理产品展示截图"): [
                "对接项目视觉需求",
                "统一展示素材风格",
                "优化版式与视觉层级",
            ],
            norm("优化端侧体验，提升展示效果"): [
                "强化场景表达，提升视觉呈现",
            ],
            norm("建立风险识别场景梳理设备接入方案设计智能研判规则"): [
                "建立风险识别场景",
                "梳理设备接入方案",
                "设计智能预警规则",
            ],
            norm("建立风险识别场景、梳理设备接入方案、设计预警规则。"): [
                "建立风险识别场景",
                "梳理设备接入方案",
                "设计智能预警规则",
            ],
            norm("支撑风险预警，连接感知设备"): [
                "支撑风险预警，连接感知设备",
            ],
            norm("调研夜市场景需求梳理用户使用流程完善功能模块设计"): [
                "梳理汇报页结构",
                "统一标题层级逻辑",
                "优化重点页面表达",
            ],
            norm("调研夜市场景需求、梳理用户流程、完善功能模块设计。"): [
                "梳理汇报页结构",
                "统一标题层级逻辑",
                "优化重点页面表达",
            ],
            norm("打磨产品逻辑，贴合真实场景。"): [
                "让汇报材料更聚焦，支撑现场展示",
            ],
            norm("打磨产品逻辑，贴合真实场景"): [
                "让汇报材料更聚焦，支撑现场展示",
            ],
            norm("搭建后端事件接口实现工单状态流转完成前后端数据联调"): [
                "梳理目标客户群体",
                "提炼试点价值卖点",
                "整理推广话术材料",
            ],
            norm("搭建后端事件接口、实现工单状态流转、完成前后端联调。"): [
                "梳理目标客户群体",
                "提炼试点价值卖点",
                "整理推广话术材料",
            ],
            norm("打通系统链路，支撑原型运行"): [
                "把产品优势转化为市场表达",
            ],
            norm("设计项目商业模式、测算试点建设成本、整理路演答辩材料。"): [
                "设计项目商业模式",
                "测算试点建设成本",
                "整理路演答辩材料",
            ],
            norm("设计项目商业模式测算试点建设成本整理路演答辩材料"): [
                "设计项目商业模式",
                "测算试点建设成本",
                "整理路演答辩材料",
            ],
            norm("完善商业闭环，支撑项目路演。"): [
                "完善商业闭环，支撑项目路演",
            ],
            norm("完善商业闭环，支撑项目路演"): [
                "完善商业闭环，支撑项目路演",
            ],
        }
    if slide_idx == 4:
        return {
            norm("涂玲统筹赛事，负责资源对接和方向指导。"): [
                "涂玲",
                "统筹赛道选择、资源对接和方向把控，帮助团队校准答辩主线。",
            ],
            norm("任汀完善项目框架，内容指导。"): [
                "任汀",
                "围绕项目框架、场景逻辑和内容表达持续指导，补足材料结构。",
            ],
            norm("谢丽芝把控经费规划、盈利模式、市场分析、规范财务安全。"): [
                "谢丽芝",
                "把控经费规划、盈利模型、市场分析和财务规范，保证商业闭环。",
            ],
            norm("周文负责团队整体备赛工作，项目申报，申报书优化。"): [
                "周文",
                "负责整体备赛、项目申报和申报书优化，提升文本完成度。",
            ],
            norm("技术"): ["技术把关"],
        }
    return {}


def replace_slide_texts(root: ET.Element, replacements: dict[str, list[str]], slide_idx: int) -> None:
    txbodies = list(iter_txbodies(root))
    placeholder_bodies = []
    for txbody in txbodies:
        text = txbody_text(txbody)
        key = norm(text)
        if slide_idx == 5 and re.fullmatch(r"x+", key):
            placeholder_bodies.append(txbody)
            continue
        if key in replacements:
            set_txbody_lines(txbody, replacements[key])

    if slide_idx == 5:
        expert_lines = [
            ["基层治理专家", "负责校准夜市、街区和社区的协同处置流程。"],
            ["夜市运营专家", "负责梳理摊位、客流、巡查和商户报险流程。"],
            ["安保企业专家", "负责巡防派单、应急响应和现场处置机制把关。"],
            ["无人机技术专家", "负责低空巡查、图传、喊话和布设方案验证。"],
            ["法务证据专家", "负责证据留存、隐私合规和流程规范。"],
        ]
        for txbody, lines in zip(placeholder_bodies, expert_lines):
            set_txbody_lines(txbody, lines)


def process_pptx(src: Path, out: Path) -> None:
    with ZipFile(src, "r") as zin, ZipFile(out, "w", compression=ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = zin.read(item.filename)
            m = re.fullmatch(r"ppt/slides/slide(\d+)\.xml", item.filename)
            if m:
                slide_idx = int(m.group(1))
                root = ET.fromstring(data)
                replace_slide_texts(root, slide_replacements(slide_idx), slide_idx)
                data = ET.tostring(root, encoding="utf-8", xml_declaration=True)
            zout.writestr(item, data)


def main() -> None:
    desktop = Path(r"D:\xx\Desktop")
    src = desktop / SRC_NAME
    if not src.exists():
        candidates = [p for p in desktop.glob("*.pptx") if not p.name.startswith("~$")]
        if not candidates:
            raise SystemExit("No pptx source found on Desktop.")
        src = sorted(candidates, key=lambda p: p.stat().st_mtime, reverse=True)[0]
    out = src.with_name(f"{src.stem}{OUT_SUFFIX}{src.suffix}")
    process_pptx(src, out)
    print(out)


if __name__ == "__main__":
    main()
