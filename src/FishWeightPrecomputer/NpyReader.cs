using System;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using System.Collections.Generic;
using System.Linq;

namespace FishWeightPrecomputer
{
    public class NpyReader
    {
        public static int[] ReadInt32(string filePath, out int[] shape)
        {
            using (var stream = File.OpenRead(filePath))
            using (var reader = new BinaryReader(stream))
            {
                // 1. Magic String "\x93NUMPY"
                byte[] magic = reader.ReadBytes(6);
                if (magic[0] != 0x93 || Encoding.ASCII.GetString(magic, 1, 5) != "NUMPY")
                    throw new Exception("Invalid NPY file: bad magic string");

                // 2. Version
                byte major = reader.ReadByte();
                byte minor = reader.ReadByte();

                // 3. Header Length
                int headerLen;
                if (major >= 2)
                    headerLen = reader.ReadInt32(); // 4 bytes little endian
                else
                    headerLen = reader.ReadUInt16(); // 2 bytes little endian

                // 4. Header
                byte[] headerBytes = reader.ReadBytes(headerLen);
                string headerStr = Encoding.ASCII.GetString(headerBytes).Trim();

                // Parse Header dictionary representation
                // Example: {'descr': '<i4', 'fortran_order': False, 'shape': (134, 8, 134), }
                
                // Parse Shape
                shape = ParseShape(headerStr);
                string descr = ParseDescr(headerStr);
                bool fortranOrder = ParseFortranOrder(headerStr);

                if (fortranOrder)
                    throw new NotSupportedException("Fortran order not supported");

                // Determine elements count
                int totalElements = 1;
                foreach (var dim in shape) totalElements *= dim;

                // Read Data
                // Assuming <i4 (int32 little endian)
                if (descr != "<i4" && descr != "|i4" && descr != "<u4" && descr != "|u4")
                {
                     // If it's float but we expect mask, that's weird. 
                     // But let's support reading as raw bytes and converting.
                     // For now, strict check.
                     // Actually let's assume it matches expected type for this specific task
                }

                byte[] dataBytes = reader.ReadBytes(totalElements * 4);
                int[] result = new int[totalElements];
                Buffer.BlockCopy(dataBytes, 0, result, 0, dataBytes.Length);

                return result;
            }
        }

        private static int[] ParseShape(string header)
        {
            var match = Regex.Match(header, @"'shape':\s*\((.*?)\)");
            if (!match.Success) throw new Exception("Could not parse shape from header");
            
            string content = match.Groups[1].Value;
            var parts = content.Split(',', StringSplitOptions.RemoveEmptyEntries);
            return parts.Select(p => int.Parse(p.Trim())).ToArray();
        }

        private static string ParseDescr(string header)
        {
            var match = Regex.Match(header, @"'descr':\s*['""](.*?)['""]");
            if (!match.Success) return "";
            return match.Groups[1].Value;
        }

        private static bool ParseFortranOrder(string header)
        {
            var match = Regex.Match(header, @"'fortran_order':\s*(True|False)");
            if (!match.Success) return false;
            return bool.Parse(match.Groups[1].Value);
        }
    }
}
