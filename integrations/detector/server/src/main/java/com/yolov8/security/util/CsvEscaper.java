package com.yolov8.security.util;

/**
 * CSV 字段转义工具，防止公式注入和 CSV 注入。
 *
 * 规则：
 * 1. 双引号转义为 ""
 * 2. 以 = + - @ 开头的字段加前缀 '（单引号），防止 Excel/LibreOffice 公式执行
 * 3. 输出时用双引号包裹
 */
public final class CsvEscaper {

    private static final char[] FORMULA_PREFIXES = {'=', '+', '-', '@'};

    private CsvEscaper() {}

    /**
     * 转义 CSV 字段并用双引号包裹。
     * null 值返回 ""。
     */
    public static String field(String value) {
        if (value == null) {
            return "\"\"";
        }
        String escaped = value.replace("\"", "\"\"");
        for (char prefix : FORMULA_PREFIXES) {
            if (!escaped.isEmpty() && escaped.charAt(0) == prefix) {
                escaped = "'" + escaped;
                break;
            }
        }
        return "\"" + escaped + "\"";
    }
}
